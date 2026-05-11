
import Database from 'better-sqlite3';
try {
  const db = new Database(':memory:');
  console.log('SQLite works!');
  db.exec('CREATE TABLE test (name TEXT)');
  db.prepare('INSERT INTO test (name) VALUES (?)').run('hello');
  console.log(db.prepare('SELECT * FROM test').get());
} catch (e) {
  console.error('SQLite failed:', e);
}
