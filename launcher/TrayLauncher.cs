using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.ComponentModel;

namespace KikiPounamu
{
    // ==========================================
    // MAIN ENTRY POINT
    // ==========================================
    static class Program
    {
        private static Mutex appMutex;

        [STAThread]
        static void Main()
        {
            // Single-instance protection using Mutex
            bool createdNew;
            appMutex = new Mutex(true, "KikiPounamu_SingleInstance_Mutex", out createdNew);

            if (!createdNew)
            {
                MessageBox.Show("KikiPounamu Launcher is already running!\nPlease check the system tray.",
                    "Already Running", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                // Ensure we have the robust root path determination logic
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string rootPath = baseDir;

                // Check if we are in the root (where ASR_server exists)
                if (!Directory.Exists(Path.Combine(rootPath, "ASR_server")))
                {
                    // If not, check if we are in a subdirectory (like 'launcher') and parent has it
                    string parent = Directory.GetParent(rootPath).FullName;
                    if (Directory.Exists(Path.Combine(parent, "ASR_server")))
                    {
                        rootPath = parent;
                    }
                    else
                    {
                        // Fallback/Error state - but let's try keep going or maybe user moved things weirdly
                        // For debugging, we default to baseDir if all else fails, but this is likely the fix.
                    }
                }

                // Check for initial setup requirement
                ConfigurationManager configManager = new ConfigurationManager(rootPath);
                AppConfig config = configManager.Load();

                // Simple check: if critical env files are missing or empty, treat as first run
                bool isFirstRun = !File.Exists(Path.Combine(rootPath, "ASR_server", ".env"));

                if (isFirstRun)
                {
                    using (var wizard = new ConfigurationForm(config, configManager))
                    {
                        if (wizard.ShowDialog() != DialogResult.OK)
                        {
                            // User cancelled setup
                            return;
                        }
                        // Config is saved inside the wizard on Finish
                        config = configManager.Load(); // Reload to be sure
                    }
                }

                Application.Run(new SysTrayApp(config, configManager, rootPath));
            }
            finally
            {
                if (appMutex != null)
                {
                    appMutex.ReleaseMutex();
                    appMutex.Dispose();
                }
            }
        }
    }

    // ==========================================
    // UI COMPONENTS
    // ==========================================
    public class SysTrayApp : Form
    {
        private NotifyIcon trayIcon;
        private ContextMenu trayMenu;
        private ConfigurationManager configManager;
        private ProcessManager processManager;
        private AppConfig config;
        private string rootPath;
        private BackgroundWorker startupWorker;

        public SysTrayApp(AppConfig config, ConfigurationManager configMgr, string rootPath)
        {
            this.config = config;
            this.configManager = configMgr;
            this.rootPath = rootPath;
            this.processManager = new ProcessManager(rootPath);

            // Initialize Tray Menu
            trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("KikiPounamu Control Panel", OnTitle).Enabled = false;
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("Start All Services", OnStart);
            trayMenu.MenuItems.Add("Stop All Services", OnStop);
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("Settings...", OnSettings);
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("Open Web Dashboard", OnOpenWeb);
            trayMenu.MenuItems.Add("Open Electron Client", OnOpenClient);
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("Exit", OnExit);

            trayIcon = new NotifyIcon();
            trayIcon.Text = "KikiPounamu ASR Manager";
            
            // Try load icon
            try {
                string icoPath = Path.Combine(rootPath, "ASR_electron", "src", "icon", "favicon.ico");
                if (File.Exists(icoPath))
                    trayIcon.Icon = new Icon(icoPath);
                else 
                    trayIcon.Icon = SystemIcons.Application;
            } catch {
                trayIcon.Icon = SystemIcons.Application;
            }

            trayIcon.ContextMenu = trayMenu;
            trayIcon.Visible = true;

            // Setup background worker for async startup
            startupWorker = new BackgroundWorker();
            startupWorker.DoWork += StartupWorker_DoWork;
            startupWorker.RunWorkerCompleted += StartupWorker_Completed;

            // Auto-start on load
            OnStart(null, null);
        }

        private void StartupWorker_DoWork(object sender, DoWorkEventArgs e)
        {
            try
            {
                // Check dependencies first
                var missing = processManager.CheckDependencies();
                if (missing.Count > 0)
                {
                    e.Result = new StartupResult { Success = false, Error = "Missing tools: " + string.Join(", ", missing.ToArray()) };
                    return;
                }
                processManager.StartAll(config);
                e.Result = new StartupResult { Success = true };
            }
            catch (Exception ex)
            {
                e.Result = new StartupResult { Success = false, Error = ex.Message };
            }
        }

        private void StartupWorker_Completed(object sender, RunWorkerCompletedEventArgs e)
        {
            var result = e.Result as StartupResult;
            if (result != null && result.Success)
            {
                trayIcon.ShowBalloonTip(3000, "KikiPounamu", "Services started successfully.", ToolTipIcon.Info);
            }
            else
            {
                string errorMsg = (result != null) ? result.Error : "Unknown error";
                trayIcon.ShowBalloonTip(5000, "KikiPounamu", "Failed to start: " + errorMsg, ToolTipIcon.Error);
            }
        }

        private class StartupResult
        {
            public bool Success { get; set; }
            public string Error { get; set; }
        }

        protected override void OnLoad(EventArgs e)
        {
            Visible = false; 
            ShowInTaskbar = false;
            base.OnLoad(e);
        }

        private void OnTitle(object sender, EventArgs e) {}

        private void OnStart(object sender, EventArgs e)
        {
            // Prevent multiple concurrent startup attempts
            if (startupWorker != null && startupWorker.IsBusy)
            {
                trayIcon.ShowBalloonTip(2000, "KikiPounamu", "Already starting...", ToolTipIcon.Warning);
                return;
            }
            trayIcon.ShowBalloonTip(2000, "KikiPounamu", "Starting services...", ToolTipIcon.Info);
            startupWorker.RunWorkerAsync();
        }

        private void OnStop(object sender, EventArgs e)
        {
            processManager.StopAll();
            trayIcon.ShowBalloonTip(3000, "KikiPounamu", "Services stopped.", ToolTipIcon.Info);
        }

        private void OnSettings(object sender, EventArgs e)
        {
            // Stop services before editing settings? Optional, but safer.
            // For now, let's just warn or allow hot-reload if possible.
            // Simpler: Just open dialog. User must restart services to apply.
            
            using (var settingsForm = new ConfigurationForm(config, configManager))
            {
                if (settingsForm.ShowDialog() == DialogResult.OK)
                {
                    config = configManager.Load(); // Reload
                    var res = MessageBox.Show("Settings saved. Restart services now to apply changes?", "KikiPounamu", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                    if (res == DialogResult.Yes)
                    {
                        OnStop(null, null);
                        OnStart(null, null);
                    }
                }
            }
        }

        private void OnOpenWeb(object sender, EventArgs e) {
            Process.Start(string.Format("http://localhost:{0}/docs", config.ApiPort)); 
        }

        private void OnOpenClient(object sender, EventArgs e) {
            MessageBox.Show("Client should be running. If not, check the 'Start All Services' output.", "Info");
        }

        private void OnExit(object sender, EventArgs e)
        {
            processManager.StopAll();
            trayIcon.Visible = false;
            Application.Exit();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && (trayIcon != null)) trayIcon.Dispose();
            base.Dispose(disposing);
        }
    }

    public class ConfigurationForm : Form
    {
        private AppConfig config;
        private ConfigurationManager configManager;
        
        private Panel pnlPage1;
        private Panel pnlPage2;
        private Button btnNext;
        private Button btnBack;
        private Button btnCancel;
        
        // Page 1 Controls
        private RadioButton rbGpu;
        private RadioButton rbCpu;
        private NumericUpDown numWorkers;
        private TextBox txtApiPort;
        private TextBox txtBackendPort;

        // Page 2 Controls
        private TextBox txtRedisHost;
        private TextBox txtRedisPort;
        private TextBox txtDbHost;
        private TextBox txtDbPort;
        private TextBox txtUserId;

        private int currentPage = 1;

        public ConfigurationForm(AppConfig config, ConfigurationManager mgr)
        {
            this.config = config;
            this.configManager = mgr;
            InitializeComponent();
            LoadValues();
            ShowPage(1);
        }

        private void InitializeComponent()
        {
            this.Text = "KikiPounamu Configuration Wizard";
            this.Size = new Size(450, 400);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;

            // Footer Buttons
            btnCancel = new Button() { Text = "Cancel", Location = new Point(350, 320), DialogResult = DialogResult.Cancel };
            btnNext = new Button() { Text = "Next >", Location = new Point(260, 320) };
            btnBack = new Button() { Text = "< Back", Location = new Point(170, 320), Enabled = false };
            
            btnNext.Click += (s, e) => {
                if (currentPage == 1) ShowPage(2);
                else SaveAndClose();
            };
            
            btnBack.Click += (s, e) => {
                if (currentPage == 2) ShowPage(1);
            };

            this.Controls.AddRange(new Control[] { btnBack, btnNext, btnCancel });

            // Page 1
            pnlPage1 = new Panel() { Size = new Size(450, 300), Location = new Point(0, 0) };
            Label lblTitle1 = new Label() { Text = "Step 1: Basic Settings", Font = new Font(FontFamily.GenericSansSerif, 12, FontStyle.Bold), Location = new Point(20, 20), AutoSize = true };
            
            GroupBox grpMode = new GroupBox() { Text = "Processing Mode", Location = new Point(20, 60), Size = new Size(380, 80) };
            rbGpu = new RadioButton() { Text = "GPU Mode (NVIDIA CUDA)", Location = new Point(20, 30), AutoSize = true, Checked = true };
            rbCpu = new RadioButton() { Text = "CPU Mode (Slower)", Location = new Point(200, 30), AutoSize = true };
            grpMode.Controls.Add(rbGpu);
            grpMode.Controls.Add(rbCpu);

            Label lblWorkers = new Label() { Text = "Worker Count:", Location = new Point(20, 160), AutoSize = true };
            numWorkers = new NumericUpDown() { Location = new Point(150, 158), Minimum = 1, Maximum = 16, Value = 2 };
            Label lblWorkersHint = new Label() { Text = "(Recommended: 2)", Location = new Point(230, 160), AutoSize = true, ForeColor = Color.Gray };

            Label lblApiPort = new Label() { Text = "API Port:", Location = new Point(20, 200), AutoSize = true };
            txtApiPort = new TextBox() { Location = new Point(150, 198), Text = "8000", Width = 70 };
            Label lblApiPortHint = new Label() { Text = "(Default: 8000)", Location = new Point(230, 200), AutoSize = true, ForeColor = Color.Gray };

            Label lblBackendPort = new Label() { Text = "Backend Port:", Location = new Point(20, 240), AutoSize = true };
            txtBackendPort = new TextBox() { Location = new Point(150, 238), Text = "8080", Width = 70 };
            Label lblBackendPortHint = new Label() { Text = "(Default: 8080)", Location = new Point(230, 240), AutoSize = true, ForeColor = Color.Gray };

            pnlPage1.Controls.AddRange(new Control[] { lblTitle1, grpMode, lblWorkers, numWorkers, lblWorkersHint, lblApiPort, txtApiPort, lblApiPortHint, lblBackendPort, txtBackendPort, lblBackendPortHint });

            // Page 2
            pnlPage2 = new Panel() { Size = new Size(450, 300), Location = new Point(0, 0), Visible = false };
            Label lblTitle2 = new Label() { Text = "Step 2: Advanced Settings", Font = new Font(FontFamily.GenericSansSerif, 12, FontStyle.Bold), Location = new Point(20, 20), AutoSize = true };

            Label lblRedis = new Label() { Text = "Redis Host/Port:", Location = new Point(20, 70), AutoSize = true };
            txtRedisHost = new TextBox() { Location = new Point(150, 68), Width = 150, Text = "localhost" };
            txtRedisPort = new TextBox() { Location = new Point(310, 68), Width = 60, Text = "6379" };

            Label lblDb = new Label() { Text = "DB Host/Port:", Location = new Point(20, 110), AutoSize = true };
            txtDbHost = new TextBox() { Location = new Point(150, 108), Width = 150, Text = "localhost" };
            txtDbPort = new TextBox() { Location = new Point(310, 108), Width = 60, Text = "5432" };

            Label lblUser = new Label() { Text = "User ID:", Location = new Point(20, 150), AutoSize = true };
            txtUserId = new TextBox() { Location = new Point(150, 148), Width = 220 };

            pnlPage2.Controls.AddRange(new Control[] { lblTitle2, lblRedis, txtRedisHost, txtRedisPort, lblDb, txtDbHost, txtDbPort, lblUser, txtUserId });

            this.Controls.Add(pnlPage1);
            this.Controls.Add(pnlPage2);
        }

        private void LoadValues()
        {
            rbGpu.Checked = config.UseGPU;
            rbCpu.Checked = !config.UseGPU;
            numWorkers.Value = config.WorkerCount;
            txtApiPort.Text = config.ApiPort.ToString();
            txtBackendPort.Text = config.BackendPort.ToString();

            txtRedisHost.Text = config.RedisHost;
            txtRedisPort.Text = config.RedisPort.ToString();
            txtDbHost.Text = config.DbHost;
            txtDbPort.Text = config.DbPort.ToString();
            txtUserId.Text = config.UserId;
        }

        private void ShowPage(int page)
        {
            currentPage = page;
            pnlPage1.Visible = (page == 1);
            pnlPage2.Visible = (page == 2);
            
            btnBack.Enabled = (page > 1);
            btnNext.Text = (page == 2) ? "Finish" : "Next >";
        }

        private void SaveAndClose()
        {
            // Validate ports with specific field error messages
            int apiPort, backendPort, redisPort, dbPort;
            
            if (!int.TryParse(txtApiPort.Text, out apiPort))
            {
                MessageBox.Show("API Port must be a valid number.", "Validation Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtApiPort.Focus();
                return;
            }
            if (!int.TryParse(txtBackendPort.Text, out backendPort))
            {
                MessageBox.Show("Backend Port must be a valid number.", "Validation Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtBackendPort.Focus();
                return;
            }
            if (!int.TryParse(txtRedisPort.Text, out redisPort))
            {
                MessageBox.Show("Redis Port must be a valid number.", "Validation Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtRedisPort.Focus();
                return;
            }
            if (!int.TryParse(txtDbPort.Text, out dbPort))
            {
                MessageBox.Show("Database Port must be a valid number.", "Validation Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtDbPort.Focus();
                return;
            }

            // Validate port ranges
            if (apiPort < 1 || apiPort > 65535)
            {
                MessageBox.Show("API Port must be between 1 and 65535.", "Validation Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtApiPort.Focus();
                return;
            }
            if (backendPort < 1 || backendPort > 65535)
            {
                MessageBox.Show("Backend Port must be between 1 and 65535.", "Validation Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtBackendPort.Focus();
                return;
            }
            if (redisPort < 1 || redisPort > 65535)
            {
                MessageBox.Show("Redis Port must be between 1 and 65535.", "Validation Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtRedisPort.Focus();
                return;
            }
            if (dbPort < 1 || dbPort > 65535)
            {
                MessageBox.Show("Database Port must be between 1 and 65535.", "Validation Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtDbPort.Focus();
                return;
            }

            try {
                config.UseGPU = rbGpu.Checked;
                config.WorkerCount = (int)numWorkers.Value;
                config.ApiPort = apiPort;
                config.BackendPort = backendPort;

                config.RedisHost = txtRedisHost.Text;
                config.RedisPort = redisPort;
                config.DbHost = txtDbHost.Text;
                config.DbPort = dbPort;
                config.UserId = txtUserId.Text;

                configManager.Save(config);
                this.DialogResult = DialogResult.OK;
                this.Close();
            } catch (Exception ex) {
                MessageBox.Show("Error saving configuration: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    // ==========================================
    // LOGIC & DATA
    // ==========================================
    public class AppConfig
    {
        public bool UseGPU { get; set; }
        public int WorkerCount { get; set; }
        public int ApiPort { get; set; }
        public int BackendPort { get; set; }
        
        public string RedisHost { get; set; }
        public int RedisPort { get; set; }
        
        public string DbHost { get; set; }
        public int DbPort { get; set; }
        public string DbUser { get; set; }
        public string DbPassword { get; set; }
        public string DbName { get; set; }
        
        public string UserId { get; set; }
        
        public AppConfig()
        {
            // Default Values replaced here (C# 5 compatible)
            UseGPU = true;
            WorkerCount = 2;
            ApiPort = 8000;
            BackendPort = 8080;
            RedisHost = "localhost";
            RedisPort = 6379;
            DbHost = "localhost";
            DbPort = 5432;
            DbUser = "postgres";
            DbPassword = "123456";
            DbName = "kikipounamu";
            UserId = "user_123456";
        }
    }

    public static class EnvFileHelper
    {
        public static Dictionary<string, string> Read(string path)
        {
            var result = new Dictionary<string, string>();
            if (!File.Exists(path)) return result;

            foreach (var line in File.ReadAllLines(path))
            {
                if (string.IsNullOrWhiteSpace(line) || line.TrimStart().StartsWith("#")) continue;
                var parts = line.Split(new[] { '=' }, 2);
                if (parts.Length == 2)
                {
                    result[parts[0].Trim()] = parts[1].Trim();
                }
            }
            return result;
        }

        public static void Write(string path, Dictionary<string, string> values)
        {
            List<string> lines = new List<string>();
            if (File.Exists(path)) lines.AddRange(File.ReadAllLines(path));

            var newLines = new List<string>();
            var keysWritten = new HashSet<string>();

            // update existing keys
            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line) || line.TrimStart().StartsWith("#"))
                {
                    newLines.Add(line);
                    continue;
                }

                var parts = line.Split(new[] { '=' }, 2);
                if (parts.Length == 2)
                {
                    string key = parts[0].Trim();
                    if (values.ContainsKey(key))
                    {
                        newLines.Add(string.Format("{0}={1}", key, values[key]));
                        keysWritten.Add(key);
                    }
                    else
                    {
                        newLines.Add(line);
                    }
                }
                else
                {
                    newLines.Add(line);
                }
            }

            // add new keys
            foreach (var kvp in values)
            {
                if (!keysWritten.Contains(kvp.Key))
                {
                    newLines.Add(string.Format("{0}={1}", kvp.Key, kvp.Value));
                }
            }

            File.WriteAllLines(path, newLines.ToArray());
        }
    }

    public class ConfigurationManager
    {
        private string rootPath;
        private string pathServerEnv;
        private string pathBackendEnv;
        private string pathElectronEnv;

        public ConfigurationManager(string root)
        {
            rootPath = root;
            pathServerEnv = Path.Combine(root, "ASR_server", ".env");
            pathBackendEnv = Path.Combine(root, "ASR_go_backend", ".env");
            pathElectronEnv = Path.Combine(root, "ASR_electron", ".env");
        }

        public AppConfig Load()
        {
            var config = new AppConfig();
            int tempInt;
            
            // Server Env
            var serverEnv = EnvFileHelper.Read(pathServerEnv);
            if(serverEnv.ContainsKey("ASR_USE_GPU")) 
            {
                string val = serverEnv["ASR_USE_GPU"].ToLower();
                config.UseGPU = (val == "true" || val == "1" || val == "yes" || val == "on");
            }
            if(serverEnv.ContainsKey("WORKER_COUNT") && int.TryParse(serverEnv["WORKER_COUNT"], out tempInt)) 
                config.WorkerCount = tempInt;
            if(serverEnv.ContainsKey("API_PORT") && int.TryParse(serverEnv["API_PORT"], out tempInt)) 
                config.ApiPort = tempInt;
            if(serverEnv.ContainsKey("REDIS_HOST")) config.RedisHost = serverEnv["REDIS_HOST"];
            if(serverEnv.ContainsKey("REDIS_PORT") && int.TryParse(serverEnv["REDIS_PORT"], out tempInt)) 
                config.RedisPort = tempInt;

            // Backend Env
            var backendEnv = EnvFileHelper.Read(pathBackendEnv);
            if(backendEnv.ContainsKey("PORT") && int.TryParse(backendEnv["PORT"], out tempInt)) 
                config.BackendPort = tempInt;
            if(backendEnv.ContainsKey("DB_HOST")) config.DbHost = backendEnv["DB_HOST"];
            if(backendEnv.ContainsKey("DB_PORT") && int.TryParse(backendEnv["DB_PORT"], out tempInt)) 
                config.DbPort = tempInt;

            // Electron Env
            var electronEnv = EnvFileHelper.Read(pathElectronEnv);
            if(electronEnv.ContainsKey("VITE_USER_ID")) config.UserId = electronEnv["VITE_USER_ID"];

            return config;
        }

        public void Save(AppConfig cfg)
        {
            // Update Server Env
            var serverUpdates = new Dictionary<string, string>();
            serverUpdates.Add("ASR_USE_GPU", cfg.UseGPU.ToString().ToLower());
            serverUpdates.Add("WORKER_COUNT", cfg.WorkerCount.ToString());
            serverUpdates.Add("API_PORT", cfg.ApiPort.ToString());
            serverUpdates.Add("REDIS_HOST", cfg.RedisHost);
            serverUpdates.Add("REDIS_PORT", cfg.RedisPort.ToString());
            
            EnvFileHelper.Write(pathServerEnv, serverUpdates);

            // Update Backend Env
            var backendUpdates = new Dictionary<string, string>();
            backendUpdates.Add("PORT", cfg.BackendPort.ToString());
            backendUpdates.Add("FUNASR_ADDR", string.Format("localhost:{0}", cfg.ApiPort));
            backendUpdates.Add("REDIS_ADDR", string.Format("{0}:{1}", cfg.RedisHost, cfg.RedisPort));
            backendUpdates.Add("DB_HOST", cfg.DbHost);
            backendUpdates.Add("DB_PORT", cfg.DbPort.ToString());
            backendUpdates.Add("DB_USER", cfg.DbUser);
            backendUpdates.Add("DB_PASSWORD", cfg.DbPassword);
            backendUpdates.Add("DB_NAME", cfg.DbName);

            EnvFileHelper.Write(pathBackendEnv, backendUpdates);

            // Update Electron Env
            var electronUpdates = new Dictionary<string, string>();
            electronUpdates.Add("VITE_USER_ID", cfg.UserId);

            EnvFileHelper.Write(pathElectronEnv, electronUpdates);
        }
    }

    public class ProcessManager
    {
        private List<Process> runningProcesses = new List<Process>();
        private List<StreamWriter> logWriters = new List<StreamWriter>();
        private string rootPath;
        private string logDir;

        public ProcessManager(string root)
        {
            rootPath = root;
            logDir = Path.Combine(root, "launcher", "logs");
            try
            {
                if (!Directory.Exists(logDir))
                    Directory.CreateDirectory(logDir);
                // Cleanup old logs on startup (keep 7 days)
                CleanupOldLogs(7);
            }
            catch { /* Log dir creation failed, will skip logging */ }
        }

        private void CleanupOldLogs(int daysToKeep)
        {
            try
            {
                if (!Directory.Exists(logDir)) return;
                var cutoff = DateTime.Now.AddDays(-daysToKeep);
                foreach (var file in Directory.GetFiles(logDir, "*.log"))
                {
                    try
                    {
                        if (File.GetLastWriteTime(file) < cutoff)
                            File.Delete(file);
                    }
                    catch { /* Skip files that can't be deleted */ }
                }
            }
            catch { /* Cleanup failed, not critical */ }
        }

        public List<string> CheckDependencies()
        {
            var missing = new List<string>();
            string[] tools = new string[] { "uv", "go", "npm" };
            foreach (var tool in tools)
            {
                try
                {
                    var psi = new ProcessStartInfo()
                    {
                        FileName = "where",
                        Arguments = tool,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true
                    };
                    using (var p = Process.Start(psi))
                    {
                        p.WaitForExit(5000);
                        if (p.ExitCode != 0)
                            missing.Add(tool);
                    }
                }
                catch
                {
                    missing.Add(tool);
                }
            }
            return missing;
        }

        public void StartAll(AppConfig config)
        {
            // Clean up any exited processes first
            runningProcesses.RemoveAll(p => {
                try { return p.HasExited; } catch { return true; }
            });
            if (runningProcesses.Count > 0) return;

            string serverDir = Path.Combine(rootPath, "ASR_server");
            string backendDir = Path.Combine(rootPath, "ASR_go_backend");
            string electronDir = Path.Combine(rootPath, "ASR_electron");

            // Validate directories exist
            if (!Directory.Exists(serverDir))
            {
                MessageBox.Show(string.Format("ASR_server directory not found: {0}", serverDir), "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            if (!Directory.Exists(backendDir))
            {
                MessageBox.Show(string.Format("ASR_go_backend directory not found: {0}", backendDir), "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            if (!Directory.Exists(electronDir))
            {
                MessageBox.Show(string.Format("ASR_electron directory not found: {0}", electronDir), "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // 1. Worker(s)
            // Command: uv run python src/worker/unified_worker.py --name worker-{i} --stream asr_tasks --group asr_workers
            // We loop for WorkerCount
            for (int i = 0; i < config.WorkerCount; i++)
            {
                string args = string.Format("run python src/worker/unified_worker.py --name worker-{0} --stream asr_tasks --group asr_workers", i);
                StartProcess("Worker-" + i, "uv", args, serverDir, config);
                 // Stagger start slightly
                Thread.Sleep(500);
            }

            // 2. API Server
            // Command: uv run uvicorn src.api.main:app --host 0.0.0.0 --port {port}
            string apiArgs = string.Format("run uvicorn src.api.main:app --host 0.0.0.0 --port {0}", config.ApiPort);
            StartProcess("API", "uv", apiArgs, serverDir, config);

            // 3. Go Backend
            // Try to find binary first
            string backendBin = Path.Combine(backendDir, "bin", "server.exe");
            if (!File.Exists(backendBin))
            {
                 // Fallback to go run
                 StartProcess("GoBackend", "go", "run cmd/server/main.go", backendDir, config);
            } 
            else 
            {
                 StartProcess("GoBackend", backendBin, "", backendDir, config);
            }

            // 4. Electron
            // Use cmd.exe /c to ensure npm.cmd is found on Windows
            StartProcess("Electron", "cmd.exe", "/c npm run dev", electronDir, config);
        }

        private void StartProcess(string name, string fileName, string arguments, string workingDir, AppConfig config)
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = fileName;
            info.Arguments = arguments;
            info.WorkingDirectory = workingDir;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;

            // Inject Environment Variables manually if needed by the process not picking up .env
            // (uv run usually picks up .env, but good to be safe for child procs)
            if (!info.EnvironmentVariables.ContainsKey("ASR_USE_GPU"))
                info.EnvironmentVariables["ASR_USE_GPU"] = config.UseGPU.ToString().ToLower();
            
            // Inject all config values into env for child processes
             info.EnvironmentVariables["WORKER_COUNT"] = config.WorkerCount.ToString();
             info.EnvironmentVariables["API_PORT"] = config.ApiPort.ToString();
             info.EnvironmentVariables["REDIS_HOST"] = config.RedisHost;
             info.EnvironmentVariables["REDIS_PORT"] = config.RedisPort.ToString();
             info.EnvironmentVariables["PORT"] = config.BackendPort.ToString();
             info.EnvironmentVariables["REDIS_ADDR"] = string.Format("{0}:{1}", config.RedisHost, config.RedisPort);
             info.EnvironmentVariables["DB_HOST"] = config.DbHost;
             info.EnvironmentVariables["DB_PORT"] = config.DbPort.ToString();
             info.EnvironmentVariables["VITE_USER_ID"] = config.UserId;

            Process p = new Process();
            p.StartInfo = info;
            p.EnableRaisingEvents = true;

            // Setup logging for process output
            StreamWriter logWriter = null;
            try
            {
                if (Directory.Exists(logDir))
                {
                    string logPath = Path.Combine(logDir, string.Format("{0}_{1}.log",
                        name, DateTime.Now.ToString("yyyyMMdd_HHmmss")));
                    logWriter = new StreamWriter(logPath, true);
                    logWriter.AutoFlush = true;
                    logWriters.Add(logWriter);

                    logWriter.WriteLine(string.Format("=== {0} Started at {1} ===", name, DateTime.Now));
                    logWriter.WriteLine(string.Format("Command: {0} {1}", fileName, arguments));
                    logWriter.WriteLine(string.Format("WorkDir: {0}", workingDir));
                    logWriter.WriteLine("========================================");
                }
            }
            catch { /* Logging setup failed, continue without logging */ }

            // Capture process output with null-check for logWriter
            StreamWriter capturedWriter = logWriter;
            p.OutputDataReceived += (s, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data) && capturedWriter != null)
                {
                    try { capturedWriter.WriteLine(string.Format("[OUT] {0}", e.Data)); }
                    catch { /* Writer may be closed */ }
                }
            };
            p.ErrorDataReceived += (s, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data) && capturedWriter != null)
                {
                    try { capturedWriter.WriteLine(string.Format("[ERR] {0}", e.Data)); }
                    catch { /* Writer may be closed */ }
                }
            };

            try {
                p.Start();
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
                runningProcesses.Add(p);
            } catch (Exception ex) {
                MessageBox.Show(string.Format("Failed to start {0}: {1}", name, ex.Message));
                if (logWriter != null)
                {
                    try { logWriter.WriteLine(string.Format("[FATAL] Failed to start: {0}", ex.Message)); }
                    catch {}
                }
            }
        }

        public void StopAll()
        {
            foreach (var p in runningProcesses)
            {
                try
                {
                    if (!p.HasExited)
                    {
                        try {
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = "taskkill",
                                Arguments = string.Format("/F /T /PID {0}", p.Id),
                                CreateNoWindow = true,
                                UseShellExecute = false
                            }).WaitForExit();
                        } catch {}
                        try { if (!p.HasExited) p.Kill(); } catch { /* Process may already be gone */ }
                    }
                }
                catch { /* Process handle already invalid */ }
                finally
                {
                    try { p.Dispose(); } catch { }
                }
            }
            runningProcesses.Clear();

            // Close all log writers
            foreach (var writer in logWriters)
            {
                try
                {
                    writer.WriteLine(string.Format("=== Log closed at {0} ===", DateTime.Now));
                    writer.Close();
                    writer.Dispose();
                }
                catch { }
            }
            logWriters.Clear();
        }
    }
}
