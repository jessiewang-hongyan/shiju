// Legacy command retained for existing contributor workflows.
require('node:child_process').execFileSync(process.execPath,['--test','tests/library-loader.test.js'],{stdio:'inherit'});
