/**
 * 修复阿里云 SDK 安装问题
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🔧 修复阿里云 SDK 安装问题\n');

const pythonExe = path.join(__dirname, '..', 'python', 'python.exe');

// 先安装核心包（跳过依赖）
const packages = [
  'aliyun-python-sdk-core-v3',  // 使用 v3 版本，更稳定
  'oss2',
  'funasr',
  'torch',
  'torchaudio', 
  'librosa',
  'numpy'
];

console.log('📦 按顺序安装包...\n');

for (const pkg of packages) {
  try {
    console.log(`正在安装: ${pkg}`);
    execSync(`"${pythonExe}" -m pip install --no-deps "${pkg}"`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    // 然后安装该包的依赖
    execSync(`"${pythonExe}" -m pip install "${pkg}"`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    console.log(`✅ ${pkg} 安装完成\n`);
  } catch (error) {
    console.error(`❌ ${pkg} 安装失败:`, error.message);
  }
}

console.log('\n验证安装...');
try {
  execSync(`"${pythonExe}" -c "import funasr; print('FunASR OK')"`, {
    stdio: 'inherit'
  });
  console.log('\n✅ 修复完成！');
} catch (error) {
  console.error('\n❌ 验证失败');
}
