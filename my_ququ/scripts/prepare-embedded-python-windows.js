const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { createWriteStream } = require('fs');
const unzipper = require('unzipper');

class WindowsEmbeddedPythonBuilder {
  constructor() {
    this.pythonVersion = '3.11.9';
    this.pythonDir = path.join(__dirname, '..', 'python');
    this.forceReinstall = false;
  }

  async build() {
    console.log('🐍 开始准备 Windows 嵌入式Python环境...');
    
    try {
      // 1. 检查现有环境
      if (!this.forceReinstall && await this.validateExistingEnvironment()) {
        console.log('✅ 现有环境验证通过，跳过重新安装');
        return;
      }
      
      // 2. 清理现有Python目录
      await this.cleanup();
      
      // 3. 下载Python嵌入式包
      await this.downloadPythonEmbeddable();
      
      // 4. 安装pip
      await this.installPip();
      
      // 5. 安装Python依赖
      await this.installDependencies();
      
      // 6. 清理不必要文件
      await this.cleanupUnnecessaryFiles();
      
      console.log('✅ Windows 嵌入式Python环境准备完成！');
      
    } catch (error) {
      console.error('❌ 准备Python环境失败:', error.message);
      process.exit(1);
    }
  }

  async cleanup() {
    if (fs.existsSync(this.pythonDir)) {
      console.log('🧹 清理现有Python目录...');
      fs.rmSync(this.pythonDir, { recursive: true, force: true });
    }
    fs.mkdirSync(this.pythonDir, { recursive: true });
  }

  async downloadPythonEmbeddable() {
    const arch = process.arch === 'x64' ? 'amd64' : 'win32';
    const filename = `python-${this.pythonVersion}-embed-${arch}.zip`;
    const url = `https://www.python.org/ftp/python/${this.pythonVersion}/${filename}`;
    const zipPath = path.join(this.pythonDir, 'python.zip');

    console.log(`📥 下载 Python ${this.pythonVersion} 嵌入式包 (${arch})...`);
    console.log(`URL: ${url}`);

    await this.downloadFile(url, zipPath);
    
    console.log('📦 解压Python嵌入式包...');
    await this.extractZip(zipPath, this.pythonDir);

    // 删除压缩包
    fs.unlinkSync(zipPath);
    
    console.log('✅ Python 嵌入式包下载完成');
  }

  async extractZip(zipPath, targetDir) {
    return new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: targetDir }))
        .on('close', resolve)
        .on('error', reject);
    });
  }

  async downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(outputPath);
      
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          return this.downloadFile(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize) {
            const progress = Math.round((downloadedSize / totalSize) * 100);
            process.stdout.write(`\r进度: ${progress}% (${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB)`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('\n✅ 下载完成');
          resolve();
        });

        file.on('error', (error) => {
          fs.unlink(outputPath, () => {});
          reject(error);
        });

      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  async installPip() {
    console.log('📦 安装 pip...');
    
    // 修改 python311._pth 文件以启用 site-packages
    const pthFile = path.join(this.pythonDir, `python311._pth`);
    if (fs.existsSync(pthFile)) {
      let content = fs.readFileSync(pthFile, 'utf8');
      // 取消注释 import site
      content = content.replace('#import site', 'import site');
      // 添加 Lib\site-packages 路径
      if (!content.includes('Lib\\site-packages')) {
        content += '\nLib\\site-packages\n';
      }
      fs.writeFileSync(pthFile, content);
      console.log('✅ 已配置 Python 路径文件');
    }

    // 创建 Lib/site-packages 目录
    const libDir = path.join(this.pythonDir, 'Lib');
    const sitePackagesDir = path.join(libDir, 'site-packages');
    if (!fs.existsSync(sitePackagesDir)) {
      fs.mkdirSync(sitePackagesDir, { recursive: true });
    }

    // 下载 get-pip.py
    const getPipPath = path.join(this.pythonDir, 'get-pip.py');
    await this.downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath);

    // 安装 pip
    const pythonExe = path.join(this.pythonDir, 'python.exe');
    try {
      execSync(`"${pythonExe}" "${getPipPath}"`, {
        stdio: 'inherit',
        cwd: this.pythonDir
      });
      fs.unlinkSync(getPipPath);
      console.log('✅ pip 安装完成');
    } catch (error) {
      throw new Error(`pip 安装失败: ${error.message}`);
    }
  }

  async installDependencies() {
    const pythonExe = path.join(this.pythonDir, 'python.exe');
    const sitePackagesPath = path.join(this.pythonDir, 'Lib', 'site-packages');

    console.log('📦 安装Python依赖...');

    const dependencies = [
      'numpy<2',
      'torch==2.0.1',
      'torchaudio==2.0.2',
      'librosa>=0.11.0',
      'funasr>=1.2.7'
    ];

    for (const dep of dependencies) {
      console.log(`📦 安装 ${dep}...`);
      try {
        execSync(`"${pythonExe}" -m pip install "${dep}"`, {
          stdio: 'inherit',
          cwd: this.pythonDir,
          env: {
            ...process.env,
            PYTHONPATH: sitePackagesPath,
            PIP_NO_CACHE_DIR: '1'
          }
        });
        console.log(`✅ ${dep} 安装完成`);
      } catch (error) {
        console.error(`❌ ${dep} 安装失败:`, error.message);
        throw error;
      }
    }

    await this.verifyDependencies(pythonExe);
  }

  async verifyDependencies(pythonExe) {
    console.log('🔍 验证依赖安装...');
    
    const criticalDeps = ['numpy', 'torch', 'librosa', 'funasr'];
    
    for (const dep of criticalDeps) {
      try {
        execSync(`"${pythonExe}" -c "import ${dep}; print('${dep} OK')"`, {
          stdio: 'pipe',
          cwd: this.pythonDir
        });
        console.log(`✅ ${dep} 验证通过`);
      } catch (error) {
        throw new Error(`关键依赖 ${dep} 安装失败`);
      }
    }
  }

  async validateExistingEnvironment() {
    const pythonExe = path.join(this.pythonDir, 'python.exe');
    
    if (!fs.existsSync(pythonExe)) {
      return false;
    }
    
    console.log('🔍 验证现有环境完整性...');
    
    try {
      const criticalDeps = ['numpy', 'torch', 'librosa', 'funasr'];
      
      for (const dep of criticalDeps) {
        execSync(`"${pythonExe}" -c "import ${dep}"`, {
          stdio: 'pipe',
          cwd: this.pythonDir,
          timeout: 10000
        });
      }
      
      console.log('✅ 现有环境验证完成');
      return true;
      
    } catch (error) {
      console.log(`❌ 环境验证失败: ${error.message}`);
      return false;
    }
  }

  async cleanupUnnecessaryFiles() {
    console.log('🧹 清理不必要文件...');
    
    // 清理测试文件和文档
    const patternsToDelete = [
      path.join(this.pythonDir, 'Lib', 'test'),
      path.join(this.pythonDir, 'Lib', 'site-packages', '**', 'tests'),
      path.join(this.pythonDir, 'Lib', 'site-packages', '**', '__pycache__')
    ];

    for (const pattern of patternsToDelete) {
      if (fs.existsSync(pattern)) {
        try {
          fs.rmSync(pattern, { recursive: true, force: true });
          console.log(`🗑️ 删除: ${path.relative(this.pythonDir, pattern)}`);
        } catch (error) {
          // 忽略删除错误
        }
      }
    }
    
    console.log('✅ 清理完成');
  }

  async getInfo() {
    const pythonExe = path.join(this.pythonDir, 'python.exe');
    
    if (!fs.existsSync(pythonExe)) {
      return { ready: false, error: 'Python未安装' };
    }

    try {
      const version = execSync(`"${pythonExe}" --version`, { 
        encoding: 'utf8',
        cwd: this.pythonDir
      }).trim();
      
      return {
        version,
        path: pythonExe,
        ready: true
      };
    } catch (error) {
      return {
        ready: false,
        error: error.message
      };
    }
  }
}

async function main() {
  const builder = new WindowsEmbeddedPythonBuilder();
  
  if (process.argv.includes('--info')) {
    const info = await builder.getInfo();
    console.log('嵌入式Python信息:', JSON.stringify(info, null, 2));
    return;
  }
  
  if (process.argv.includes('--force')) {
    console.log('🔄 强制重新安装模式');
    builder.forceReinstall = true;
  }
  
  await builder.build();
  
  const info = await builder.getInfo();
  console.log('\n📊 嵌入式Python环境信息:');
  console.log(`版本: ${info.version}`);
  console.log(`路径: ${info.path}`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = WindowsEmbeddedPythonBuilder;
