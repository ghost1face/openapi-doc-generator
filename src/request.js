function Request(data, definitions) {
    this.uri = data.uri;
    this.method = data.method.toUpperCase();
    this.headers = buildMap(data.headers);
    this.query = data.query;
    this.body = data.body;
}

Request.prototype.getPart = function (key) {
    return this[key];
}

function buildMap(obj) {
    var map = new Map();
    Object.keys(obj).forEach(function (key) {
        map.set(key, obj[key]);
    });
    return map;
}

module.exports = Request;