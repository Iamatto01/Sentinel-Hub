const db = require('../src/lib/db');

console.log('Existing packages:', db.getAllPackages());

db.db.prepare('DELETE FROM packages').run();
const insertPackage = db.db.prepare(`
  INSERT INTO packages (name, tokens, valid_days, price_myr, type, is_active)
  VALUES (?, ?, ?, ?, ?, 1)
`);

insertPackage.run('Starter 10M (28 Hari)', 10000000, 28, 2.00, 'all');
insertPackage.run('Standard 50M (28 Hari)', 50000000, 28, 4.00, 'all');
insertPackage.run('MEGA DEAL 100M (28 Hari)', 100000000, 28, 6.00, 'all');
insertPackage.run('Pro Developer 200M (28 Hari)', 200000000, 28, 11.00, 'all');
insertPackage.run('Agency Master 500M (28 Hari)', 500000000, 28, 25.00, 'all');

console.log('Updated packages:', db.getAllPackages());
