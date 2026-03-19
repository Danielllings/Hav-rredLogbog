// Shim for semver/functions/satisfies to work with Metro bundler
const semver = require('semver');
module.exports = semver.satisfies;
