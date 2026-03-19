// Shim for semver/functions/prerelease to work with Metro bundler
const semver = require('semver');
module.exports = semver.prerelease;
