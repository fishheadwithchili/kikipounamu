[Setup]
AppName=KikiPounamu
AppVersion=1.0.0
AppPublisher=KikiPounamu Team
DefaultDirName={autopf}\KikiPounamu
DefaultGroupName=KikiPounamu
OutputBaseFilename=KikiPounamu_Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
; Require Windows 10/11
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; The Launcher Executable (compiled from C#)
Source: "KikiPounamuLauncher.exe"; DestDir: "{app}"; Flags: ignoreversion

; Core Service: Python ASR Server
Source: "..\ASR_server\*"; DestDir: "{app}\ASR_server"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "__pycache__,*.pyc,.git,.vscode,.venv,logs,*.log"

; Core Service: Go Backend
Source: "..\ASR_go_backend\*"; DestDir: "{app}\ASR_go_backend"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git,.vscode"

; Client: Electron App
; NOTE: We are bundling the source. In a production build, you should build the electron app to an exe and bundle that instead.
; We exclude node_modules to keep installer size small, but this means 'npm install' must be run. 
; For this "Bootstrapper", we will assume the user environment (or our launcher) handles it, or we include it.
; INCLUDING node_modules for 'It Just Works' experience, though it makes installer creation slow.
Source: "..\ASR_electron\*"; DestDir: "{app}\ASR_electron"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git,.vscode,node_modules"

; Documentation
Source: "..\doc\*"; DestDir: "{app}\doc"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\KikiPounamu"; Filename: "{app}\KikiPounamuLauncher.exe"
Name: "{autodesktop}\KikiPounamu"; Filename: "{app}\KikiPounamuLauncher.exe"; Tasks: desktopicon

[Run]
; Install npm dependencies with error handling
Filename: "powershell.exe"; \
    Parameters: "-ExecutionPolicy Bypass -Command ""$ErrorActionPreference='Stop'; try {{ Set-Location '{app}\ASR_electron'; npm install; if ($LASTEXITCODE -ne 0) {{ throw 'npm install failed' }} }} catch {{ [System.Windows.Forms.MessageBox]::Show('Failed to install Electron dependencies. Please check your network connection and run the following command manually:' + [char]13 + [char]10 + [char]13 + [char]10 + 'cd \""{app}\ASR_electron\"" && npm install' + [char]13 + [char]10 + [char]13 + [char]10 + 'Error: ' + $_.Exception.Message, 'Network Error', 'OK', 'Error'); exit 1 }}"""; \
  StatusMsg: "Installing Electron dependencies (requires network, may take a while)..."; \
  Flags: runhidden waituntilterminated; \
  Check: NeedInstallNodeModules

Filename: "{app}\KikiPounamuLauncher.exe"; Description: "{cm:LaunchProgram,KikiPounamu}"; Flags: nowait postinstall skipifsilent

[Code]
var
  Page: TInputQueryWizardPage;

function CheckRedisInstalled: Boolean;
begin
  // Simple check for default Redis service or path
  Result := RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\Redis') or
            FileExists('C:\Program Files\Redis\redis-server.exe');
end;

function CheckPostgresInstalled: Boolean;
begin
  // Simple check for Postgres service
  Result := RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\postgresql-x64-14') or
             RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\postgresql-x64-15');
end;

function NeedsInstallPython: Boolean;
begin
  // Checking for Python 3.10 specifically is hard, but we can check if 'python' is in PATH or registry
  // This is a basic check.
  Result := not RegKeyExists(HKLM, 'SOFTWARE\Python\PythonCore\3.10\InstallPath');
end;

function NeedInstallNodeModules: Boolean;
begin
  Result := True;
end;

procedure InitializeWizard;
begin
  // We could add a custom page to ask for ports here
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ErrCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    // Logic to check requirements and warn user if missing
    if not CheckRedisInstalled then
      MsgBox('Warning: Redis does not seem to be installed or running as a service.' #13#13 'Please ensure Redis is installed for KikiPounamu to work.', mbInformation, MB_OK);

    if not CheckPostgresInstalled then
      MsgBox('Warning: PostgreSQL does not seem to be installed.' #13#13 'Please ensure PostgreSQL is installed and standard user/pass (postgres/123456) is set.', mbInformation, MB_OK);
  end;
end;
