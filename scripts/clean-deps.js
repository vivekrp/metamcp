import fs from 'fs';
import path from 'path';

function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file, index) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // Recurse
        deleteFolderRecursive(curPath);
      } else {
        // Delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
}

function cleanNodeModules() {
  const findAndDeleteNodeModules = (dir) => {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      const fullPath = path.join(dir, file);
      if (fs.lstatSync(fullPath).isDirectory()) {
        if (file === 'node_modules') {
          console.log(`Removing ${fullPath}`);
          deleteFolderRecursive(fullPath);
        } else {
          findAndDeleteNodeModules(fullPath);
        }
      }
    });
  };

  findAndDeleteNodeModules(process.cwd());
  console.log('🧹 Finished cleaning node_modules directories');
}

cleanNodeModules();

