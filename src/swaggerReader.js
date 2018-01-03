// const _ = require('lodash');
var fs = require('fs');

function SwaggerReader(swaggerPath) {
    this._path = swaggerPath;
}

SwaggerReader.prototype._checkExists = function(path) {
    return fs.existsSync(path);
}

SwaggerReader.prototype._read = function(path) {
    return fs.readFileSync(path, 'utf8');
}

SwaggerReader.prototype.parseFile = function() {
    var path = this._path;
    if(!this._checkExists(path))
        throw Error('Unable to find file ' + path);

    var swaggerText = this._read(path);
    if(!swaggerText)
        throw Error('Invalid swagger document!');

    return JSON.parse(swaggerText);
}

module.exports = SwaggerReader;