# Island: сопряжённые Bluetooth-устройства и включение/выключение Bluetooth.
# Без параметров печатает одну строку:
#   ISLAND_JSON { radio, service, devices: [{ name, connected, battery }], errors: [...], ms }
param([string]$Radio = '')
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$sw = [Diagnostics.Stopwatch]::StartNew()
$errors = New-Object System.Collections.ArrayList
function Note([string]$m) { [void]$errors.Add($m) }

# ---------- WinRT: ожидание асинхронных вызовов с таймаутом ----------
$asTaskGeneric = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
} catch { Note ("winrt: " + $_.Exception.Message) }
function Await($op, $type, [int]$ms = 5000) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $t.Wait($ms)) { throw "WinRT не ответил за $($ms / 1000) с" }
  $t.Result
}

# ---------- радио ----------
$bt = $null
try {
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
  [Console]::Out.WriteLine('ISLAND_JSON ' + (@{ ok = ($null -ne $bt); errors = @($errors) } | ConvertTo-Json -Compress))
  exit
}

$service = $null
try { $service = [string](Get-Service bthserv -ErrorAction Stop).Status } catch { Note ("service: " + $_.Exception.Message) }

$byMac = [ordered]@{}

# ---------- способ 1: WinRT DeviceInformation — весь список одним запросом ----------
try {
  [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
  [Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
  $props = [string[]]@('System.Devices.Aep.IsConnected', 'System.Devices.Aep.DeviceAddress')
  $kind = [Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint
  $selectors = @(
    [Windows.Devices.Bluetooth.BluetoothDevice]::GetDeviceSelectorFromPairingState($true),
    [Windows.Devices.Bluetooth.BluetoothLEDevice]::GetDeviceSelectorFromPairingState($true)
  )
  foreach ($sel in $selectors) {
    $col = Await ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($sel, $props, $kind)) ([Windows.Devices.Enumeration.DeviceInformationCollection]) 6000
    foreach ($di in $col) {
      if (-not $di.Name) { continue }
      $addr = ''; $conn = $false
      try { $addr = [string]$di.Properties['System.Devices.Aep.DeviceAddress'] } catch {}
      try { $conn = [bool]$di.Properties['System.Devices.Aep.IsConnected'] } catch {}
      $mac = ($addr -replace '[^0-9A-Fa-f]', '').ToUpper()
      if (-not $mac) { $mac = [string]$di.Id }
      if ($byMac.Contains($mac)) { if ($conn) { $byMac[$mac].connected = $true }; continue }
      $byMac[$mac] = [ordered]@{ name = [string]$di.Name; connected = $conn; battery = $null }
    }
  }
} catch { Note ("list: " + $_.Exception.Message) }

# ---------- способ 2 (если первый ничего не дал): Диспетчер устройств ----------
$KEY_CONNECTED = '{83DA6326-97A6-4088-9453-A1923F573B29} 15'
$KEY_BATTERY = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
$pnp = @()
try { $pnp = @(Get-PnpDevice -ErrorAction Stop | Where-Object { [string]$_.InstanceId -match '^(BTHENUM|BTHLE|BTHLEDEVICE)\\' }) } catch { Note ("pnp: " + $_.Exception.Message) }
if ($byMac.Count -eq 0) {
  foreach ($d in $pnp) {
    $m = [regex]::Match([string]$d.InstanceId, '^(?:BTHENUM|BTHLE)\\DEV_([0-9A-F]{12})', 'IgnoreCase')
    if (-not $m.Success -or -not $d.FriendlyName) { continue }
    $mac = $m.Groups[1].Value.ToUpper()
    if ($byMac.Contains($mac)) { continue }
    $connected = ([string]$d.Status -eq 'OK')
    try {
      $p = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName $KEY_CONNECTED -ErrorAction Stop
      if ($p -and $null -ne $p.Data) { $connected = [bool]$p.Data }
    } catch {}
    $byMac[$mac] = [ordered]@{ name = [string]$d.FriendlyName; connected = $connected; battery = $null }
    if ($sw.Elapsed.TotalSeconds -gt 15) { Note 'pnp: прервано по времени'; break }
  }
}

# ---------- заряд — только у подключённых, и не дольше ~6 с суммарно ----------
foreach ($mac in @($byMac.Keys)) {
  $v = $byMac[$mac]
  if (-not $v.connected -or $mac.Length -ne 12) { continue }
  if ($sw.Elapsed.TotalSeconds -gt 18) { break }
  foreach ($c in $pnp) {
    if ([string]$c.InstanceId -notlike "*$mac*") { continue }
    try {
      $b = (Get-PnpDeviceProperty -InstanceId $c.InstanceId -KeyName $KEY_BATTERY -ErrorAction Stop).Data
      if ($null -ne $b) { $v.battery = [int]$b; break }
    } catch {}
  }
}

# ---------- запасной путь: имена сопряжённых из реестра ----------
if ($byMac.Count -eq 0) {
  try {
    $base = 'HKLM:\SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters\Devices'
    foreach ($k in @(Get-ChildItem $base -ErrorAction Stop)) {
      $mac = $k.PSChildName.ToUpper()
      $raw = (Get-ItemProperty $k.PSPath -Name Name -ErrorAction SilentlyContinue).Name
      if (-not $raw) { continue }
      $name = [System.Text.Encoding]::UTF8.GetString([byte[]]$raw).Trim([char]0).Trim()
      if ($name) { $byMac[$mac] = [ordered]@{ name = $name; connected = $false; battery = $null } }
    }
  } catch { Note ("registry: " + $_.Exception.Message) }
}

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
$out = [ordered]@{ radio = $state; service = $service; devices = @($list); errors = @($errors); ms = [int]$sw.Elapsed.TotalMilliseconds }
[Console]::Out.WriteLine('ISLAND_JSON ' + ($out | ConvertTo-Json -Compress -Depth 5))
