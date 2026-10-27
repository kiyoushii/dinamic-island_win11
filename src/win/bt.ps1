# Island: список сопряжённых Bluetooth-устройств и включение/выключение Bluetooth.
# Без параметров печатает JSON: { radio: "On"|"Off"|null, devices: [{ name, connected, battery }] }
param([string]$Radio = '')
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, $type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

[Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
$bt = $null
try {
  Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
  $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
  $bt = $radios | Where-Object { $_.Kind -eq 'Bluetooth' } | Select-Object -First 1
} catch {}

if ($Radio -ne '') {
  if ($bt) { Await ($bt.SetStateAsync($Radio)) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null }
  exit
}

$KEY_CONNECTED = '{83DA6326-97A6-4088-9453-A1923F573B29} 15'
$KEY_BATTERY = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
$all = Get-PnpDevice
$devs = $all | Where-Object { $_.InstanceId -match '^(BTHENUM|BTHLE)\\DEV_([0-9A-F]{12})' }
$seen = @{}
$list = @()
foreach ($d in $devs) {
  $name = $d.FriendlyName
  if (-not $name -or $seen.ContainsKey($name)) { continue }
  $seen[$name] = $true
  $mac = ([regex]::Match($d.InstanceId, 'DEV_([0-9A-F]{12})')).Groups[1].Value
  $connected = [bool](Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName $KEY_CONNECTED).Data
  $battery = $null
  foreach ($c in ($all | Where-Object { $_.InstanceId -like "*$mac*" })) {
    $b = (Get-PnpDeviceProperty -InstanceId $c.InstanceId -KeyName $KEY_BATTERY).Data
    if ($null -ne $b) { $battery = [int]$b; break }
  }
  $list += @{ name = $name; connected = $connected; battery = $battery }
}
$state = $null
if ($bt) { $state = [string]$bt.State }
[Console]::Out.WriteLine((@{ radio = $state; devices = @($list) } | ConvertTo-Json -Compress -Depth 4))
