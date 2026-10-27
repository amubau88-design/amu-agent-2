# Read-only inventory; no serial numbers, activation keys, installation, benchmarks or security changes.
$ErrorActionPreference='Stop'
$result=[ordered]@{at=[DateTime]::UtcNow.ToString('o');readOnly=$true;limitations=@()}
$queries=[ordered]@{
 board=@('Win32_BaseBoard',@('Manufacturer','Product','Version'))
 bios=@('Win32_BIOS',@('Manufacturer','SMBIOSBIOSVersion','Version','ReleaseDate'))
 system=@('Win32_ComputerSystem',@('Manufacturer','Model','SystemType','TotalPhysicalMemory','HypervisorPresent'))
 cpu=@('Win32_Processor',@('Name','NumberOfCores','NumberOfLogicalProcessors','MaxClockSpeed','SocketDesignation','AddressWidth','VirtualizationFirmwareEnabled','SecondLevelAddressTranslationExtensions'))
 memoryArrays=@('Win32_PhysicalMemoryArray',@('MemoryDevices','MaxCapacity','MaxCapacityEx','MemoryErrorCorrection','Use','Location'))
 memory=@('Win32_PhysicalMemory',@('BankLabel','DeviceLocator','Capacity','SMBIOSMemoryType','MemoryType','Speed','ConfiguredClockSpeed','DataWidth','TotalWidth','FormFactor','Manufacturer','PartNumber'))
 gpu=@('Win32_VideoController',@('Name','AdapterRAM','DriverVersion','DriverDate','VideoProcessor','Status'))
 slots=@('Win32_SystemSlot',@('SlotDesignation','Description','MaxDataWidth','CurrentUsage','ConnectorType','PMESignal','Shared'))
 os=@('Win32_OperatingSystem',@('Caption','Version','BuildNumber','OSArchitecture','FreePhysicalMemory','LastBootUpTime'))
 hotfixes=@('Win32_QuickFixEngineering',@('HotFixID','InstalledOn','Description'))
}
foreach($name in $queries.Keys){try {$entry=$queries[$name];$result[$name]=@(Get-CimInstance -ClassName $entry[0] | Select-Object -Property $entry[1])}catch{$result.limitations+=$name+': '+$_.Exception.GetType().Name}}
try {$result.security=@(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct | Select-Object displayName,productState)}catch{$result.limitations+='SecurityCenter inventory unavailable'}
try {$result.defender=Get-MpComputerStatus | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureLastUpdated,AntivirusSignatureVersion,ComputerState}catch{$result.limitations+='Defender status unavailable'}
$result.physicalInspectionRequired=@('PSU label, wattage and PCIe connectors','Case GPU length/height/slot clearance','Board printed revision and riser/cable arrangement','Airflow and sustained thermal limits')
$result | ConvertTo-Json -Depth 8
