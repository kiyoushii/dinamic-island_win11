# Island: сопряжённые Bluetooth-устройства и включение/выключение Bluetooth.
# Без параметров печатает одну JSON-строку:
#   { radio: "On"|"Off"|"Disabled"|null, service: "Running"|..., devices: [{ name, connected, battery }], errors: [...] }
param([string]$Radio = '')
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$errors = New-Object System.Collections.ArrayList
function Note([string]$m) { [void]$errors.Add($m) }

# ---------- радио (WinRT) — с таймаутом, чтобы зависание не ломало список ----------
$bt = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  function Await($op, $type) {
    $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    if (-not $t.Wait(5000)) { throw 'WinRT не ответил за 5 с' }
    $t.Result
  }
  [Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
  Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
  $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
  $bt = $radios | Where-Object { [string]$_.Kind -eq 'Bluetooth' } | Select-Object -First 1
  if (-not $bt) { Note 'Bluetooth-адаптер не найден' }
} catch { Note ("radio: " + $_.Exception.Message) }

if ($Radio -ne '') {
  if ($bt) {
    try { Await ($bt.SetStateAsync($Radio)) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null } catch { Note ("set: " + $_.Exception.Message) }
  }
  [Console]::Out.WriteLine((@{ ok = ($null -ne $bt); errors = @($errors) } | ConvertTo-Json -Compress))
  exit
}

$service = $null
try { $service = [string](Get-Service bthserv -ErrorAction Stop).Status } catch { Note ("service: " + $_.Exception.Message) }

# ---------- устройства: PnP ----------
$KEY_CONNECTED = '{83DA6326-97A6-4088-9453-A1923F573B29} 15'
$KEY_BATTERY = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
$byMac = [ordered]@{}
try {
  $all = @(Get-PnpDevice -ErrorAction Stop)
  foreach ($d in $all) {
    $m = [regex]::Match([string]$d.InstanceId, '^(?:BTHENUM|BTHLE)\\DEV_([0-9A-F]{12})', 'IgnoreCase')
    if (-not $m.Success -or -not $d.FriendlyName) { continue }
    $mac = $m.Groups[1].Value.ToUpper()
    if ($byMac.Contains($mac)) { continue }
    $connected = $null
    try {
      $p = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName $KEY_CONNECTED -ErrorAction Stop
      if ($p -and [string]$p.Type -ne 'Empty' -and $null -ne $p.Data) { $connected = [bool]$p.Data }
    } catch {}
    if ($null -eq $connected) { $connected = ([string]$d.Status -eq 'OK') }
    $battery = $null
    foreach ($c in $all) {
      if ([string]$c.InstanceId -notlike "*$mac*") { continue }
      try {
        $b = (Get-PnpDeviceProperty -InstanceId $c.InstanceId -KeyName $KEY_BATTERY -ErrorAction Stop).Data
        if ($null -ne $b) { $battery = [int]$b; break }
      } catch {}
    }
    $byMac[$mac] = [ordered]@{ name = [string]$d.FriendlyName; connected = $connected; battery = $battery }
  }
} catch { Note ("pnp: " + $_.Exception.Message) }

# ---------- запасной путь: список сопряжённых из реестра ----------
try {
  $base = 'HKLM:\SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters\Devices'
  foreach ($k in @(Get-ChildItem $base -ErrorAction Stop)) {
    $mac = $k.PSChildName.ToUpper()
    if ($byMac.Contains($mac)) { continue }
    $raw = (Get-ItemProperty $k.PSPath -Name Name -ErrorAction SilentlyContinue).Name
    if (-not $raw) { continue }
    $name = [System.Text.Encoding]::UTF8.GetString([byte[]]$raw).Trim([char]0).Trim()
    if ($name) { $byMac[$mac] = [ordered]@{ name = $name; connected = $false; battery = $null } }
  }
} catch { Note ("registry: " + $_.Exception.Message) }

# одинаковые имена (классическое + BLE подключение одного устройства) склеиваем
$seen = @{}
$list = New-Object System.Collections.ArrayList
foreach ($v in $byMac.Values) {
  $n = $v.name
  if ($seen.ContainsKey($n)) {
    $prev = $seen[$n]
    if ($v.connected) { $prev.connected = $true }
    if ($null -eq $prev.battery) { $prev.battery = $v.battery }
    continue
  }
  $seen[$n] = $v
  [void]$list.Add($v)
}

$state = $null
if ($bt) { $state = [string]$bt.State }
$out = [ordered]@{ radio = $state; service = $service; devices = @($list); errors = @($errors) }
[Console]::Out.WriteLine('ISLAND_JSON ' + ($out | ConvertTo-Json -Compress -Depth 5))
