
import fs from 'fs';
import path from 'path';
const p = path.join(process.cwd(), 'src/data/initial_rules.json');
console.log('Path:', p);
console.log('Exists:', fs.existsSync(p));
if (fs.existsSync(p)) {
  console.log('Content preview:', fs.readFileSync(p, 'utf8').substring(0, 100));
}
