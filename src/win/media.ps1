# Island: мост к Windows. Раз в ~0.5 с печатает JSON-строку с состоянием музыки и громкости,
# читает команды из stdin (по одной в строке): toggle | next | prev | seek <сек> | vol <0..1> | mute | paste
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

public static class IslandAudio {
  static IAudioEndpointVolume Vol() {
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out epv));
    return epv;
  }
  public static float GetVolume() { float v = -1; try { Vol().GetMasterVolumeLevelScalar(out v); } catch {} return v; }
  public static void SetVolume(float v) { try { Vol().SetMasterVolumeLevelScalar(v, Guid.Empty); } catch {} }
  public static bool GetMute() { bool m = false; try { Vol().GetMute(out m); } catch {} return m; }
  public static void SetMute(bool m) { try { Vol().SetMute(m, Guid.Empty); } catch {} }
}
"@

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, $type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$MgrT = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$PropsT = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$mgr = Await ($MgrT::RequestAsync()) $MgrT

function Get-Thumb($props) {
  if ($null -eq $props.Thumbnail) { return $null }
  try {
    $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  } catch { return $null }
  # способ 1: .NET-обёртка над потоком WinRT
  try {
    $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms)
    $bytes = $ms.ToArray()
    $net.Dispose(); $ms.Dispose()
    if ($bytes.Length -gt 0) { return [Convert]::ToBase64String($bytes) }
  } catch {}
  # способ 2: DataReader (работает, когда обёртка не привязывается к типу потока)
  try {
    $size = [uint32]$stream.Size
    if ($size -eq 0) { return $null }
    $dr = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    Await ($dr.LoadAsync($size)) ([uint32]) | Out-Null
    $bytes = New-Object byte[] $size
    $dr.ReadBytes($bytes)
    $dr.Dispose()
    return [Convert]::ToBase64String($bytes)
  } catch { return $null }
}

# Console.In в .NET Framework читает синхронно, поэтому берём свой StreamReader поверх stdin
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$pending = $reader.ReadLineAsync()
$lastKey = ''

while ($true) {
  # --- команды ---
  while ($pending.IsCompleted) {
    $line = $pending.Result
    if ($null -eq $line) { exit }
    $pending = $reader.ReadLineAsync()
    $parts = $line.Trim().Split(' ')
    $s = $mgr.GetCurrentSession()
    switch ($parts[0]) {
      'toggle' { if ($s) { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null } }
      'next'   { if ($s) { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null } }
      'prev'   { if ($s) { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null } }
      'seek'   { if ($s) { Await ($s.TryChangePlaybackPositionAsync([long]([double]$parts[1] * 10000000))) ([bool]) | Out-Null } }
      'vol'    { [IslandAudio]::SetVolume([float]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture)) }
      'paste'  { [System.Windows.Forms.SendKeys]::SendWait('^v') }
      'mute'   { [IslandAudio]::SetMute(-not [IslandAudio]::GetMute()) }
    }
  }

  # --- состояние ---
  $out = @{ volume = [IslandAudio]::GetVolume(); muted = [IslandAudio]::GetMute(); media = $null }
  $s = $mgr.GetCurrentSession()
  if ($s) {
    $props = Await ($s.TryGetMediaPropertiesAsync()) $PropsT
    $info = $s.GetPlaybackInfo()
    $tl = $s.GetTimelineProperties()
    $key = "$($props.Title)|$($props.Artist)"
    $sendThumb = $null
    if ($key -ne $lastKey) { $sendThumb = Get-Thumb $props; $lastKey = $key }
    $out.media = @{
      title    = $props.Title
      artist   = $props.Artist
      album    = $props.AlbumTitle
      app      = $s.SourceAppUserModelId
      playing  = ($info.PlaybackStatus -eq 4)
      position = $tl.Position.TotalSeconds
      duration = $tl.EndTime.TotalSeconds
      updated  = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
      key      = $key
      thumb    = $sendThumb
    }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 500
}
