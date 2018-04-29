let SwaggerReader = require('./swaggerReader');
let Request = require('./request');
let fs = require('fs');
let path = require('path');
let _ = require('lodash');
let httpMethods = require('./httpMethods').httpMethods;
let supportedLanguages = require('./supportedLanguages').supportedLanguages;
let generateCodeSample = require('./codeSampleGenerator');

function MarkdownGenerator(path, outputDir) {
    this._path = path;
    this._outputDir = outputDir;
    this._tags = undefined;
    this._definitions = undefined;
    this._version = undefined;
}

MarkdownGenerator.prototype.emit = function () {
    let that = this;
    let reader = new SwaggerReader(this._path);
    let swaggerDoc = reader.parseFile();

    if (!this._isValid(swaggerDoc))
        throw Error('Invalid swagger file.');

    this._tags = swaggerDoc.tags;
    this._definitions = swaggerDoc.definitions;
    this._version = swaggerDoc.info.version.replace('v', '').replace('V', '');

    let pathItemCollection = this._groupPathsByResource(swaggerDoc.paths);

    _.forEach(pathItemCollection, function (pathItems, groupTag) {
        let fileName = groupTag + '.md';

        that._writeFile(fileName, pathItems);
    });

    debugger;

    let definitionPaths = this._getReturnModelsFromResources(pathItemCollection);
    
    this._writeModelDefinitions(definitionPaths);
}

MarkdownGenerator.prototype._isValid = function (swaggerDoc) {
    return !(!swaggerDoc || !swaggerDoc['swagger'] || !swaggerDoc['info'] || !swaggerDoc['paths']);
}

MarkdownGenerator.prototype._groupPathsByResource = function (paths) {
    return _(paths)
        .map(function (data, key) {
            data._path = key;
            return data;
        })
        .groupBy(function (path) {
            let pathKey = _.filter(Object.keys(path), function (key) {
                return key !== '_path';
            })[0];

            if (!pathKey) return '';

            let pathItem = path[pathKey];
            if (!pathItem) return '';

            let primaryTag = pathItem['tags'][0];
            if (!primaryTag)
                return this._getResourceNameFromPath(paths._path);

            return primaryTag.toLowerCase();
        })
        .value();
}

MarkdownGenerator.prototype._getResourceNameFromPath = function (path) {
    path = path.replace('/v{version}/', '');
    return path.split('/')[2];
}

MarkdownGenerator.prototype._writeFile = function (fileName, pathItems) {
    let that = this;

    let fileContent =
        '## ' + this._getPathItemsTitle(pathItems) + '\n\n' +
        this._getPathItemsDescription(pathItems) + '\n\n';

    _.forEach(pathItems, function (pathItem) {
        _.forEach(httpMethods, function (httpMethod) {
            let endpoint = pathItem[httpMethod];

            if (typeof endpoint === 'undefined')
                return;

            fileContent += '### ' + (endpoint['x-title'] || endpoint['operationId']) + '\n\n' +
                that._getOperationDescription(httpMethod, pathItem) + '\n\n' +
                that._getEndpointUri(httpMethod, pathItem) +
                '#### Example Request' + '\n\n';

            _.forEach(supportedLanguages, function (language) {
                fileContent += that._getSampleApiCode(pathItem, httpMethod, language);
            });

            // query parameter definitions
            fileContent += that._getQueryParametersAsTable(httpMethod, pathItem);

            // body parameter definitions
            fileContent += that._getBodyParametersAsTable(httpMethod, pathItem);

            // response
            let positiveResponse = that._getPositiveResponse(httpMethod, pathItem);
            let responseContentType = that._getFirstResponseContentType(httpMethod, pathItem);
            fileContent += '#### Example Response\n\n' +
                '```http\n' +
                'HTTP/1.1 ' + positiveResponse.statusCode + ' ' + positiveResponse.description + '\n' +
                (responseContentType && 'Content-Type: ' + that._getFirstResponseContentType(httpMethod, pathItem) + '\n') +
                '```\n';

            if (positiveResponse.statusCode !== '204') {
                let responseExample = that._getPositiveResponseExample(pathItem[httpMethod], positiveResponse.statusCode);
                if (typeof responseExample !== 'undefined') {
                    // if no content build response
                    fileContent += '```json\n' +
                        JSON.stringify(responseExample, null, 2) + '\n' +
                        '```\n\n';
                }
            }
            else {
                fileContent += '\n';
            }
        });
    });

    let outputPath = path.join(path.resolve(path.normalize(this._outputDir)), fileName);

    fs.writeFileSync(outputPath, fileContent);
}

MarkdownGenerator.prototype._getPathItemsTitle = function (pathItems) {
    let action = pathItems[0];
    let actionKey = _.filter(Object.keys(action), function (key) {
        return key !== '_path';
    })[0];

    let fallbackTitle = action[actionKey]['operationId'].split('_')[0];

    let pathItem = pathItems[0];
    if (!pathItem)
        return fallbackTitle;

    let operationKey = _.filter(Object.keys(pathItem), key => key !== '_path')[0];
    if (!operationKey)
        return fallbackTitle;

    let operation = pathItem[operationKey];
    if (!operation)
        return fallbackTitle;

    let primaryTag = operation.tags[0];
    if (!primaryTag)
        return fallbackTitle;

    let detailTag = _.filter(this._tags, function (tag) {
        return tag.name === primaryTag;
    })[0];
    if (!detailTag)
        return fallbackTitle;

    return (detailTag['x-title'] || '').trim() || fallbackTitle;
}

MarkdownGenerator.prototype._getPathItemsDescription = function (pathItems) {
    let pathItem = pathItems[0];
    if (!pathItem)
        return '';

    let operationKey = _.filter(Object.keys(pathItem), function (key) {
        return key !== '_path'
    })[0];

    if (!operationKey)
        return '';

    let operation = pathItem[operationKey];
    if (!operation)
        return '';

    let primaryTag = operation.tags[0];
    if (!primaryTag)
        return '';

    let detailTag = _.filter(this._tags, function (tag) {
        return tag.name === primaryTag;
    })[0];

    if (!detailTag)
        return '';

    return (detailTag.description || '').trim();
}

MarkdownGenerator.prototype._getOperationDescription = function (httpMethod, resource) {
    let operation = resource[httpMethod];
    return operation.description || operation.summary || '';
}

MarkdownGenerator.prototype._getEndpointUri = function (httpMethod, pathItem) {
    let params = _.map(this._getQueryParameters(pathItem[httpMethod]), function (p) {
        return p['name'] + '={' + p['name'].replace('.', '') + '}';
    });

    let permissionScopes = this._getScopes(httpMethod, pathItem);

    if (params && params.length) {
        params = '?\n        ' + params.join('\n        &');
    }

    const result =
        '```endpoint\n' +
        httpMethod.toUpperCase() + ' ' + this._getResourceFormattedUrl(pathItem) + params + (permissionScopes && (' ' + permissionScopes)) + '\n' +
        '```\n\n';

    return result;
}

MarkdownGenerator.prototype._getScopes = function (httpMethod, pathItem) {
    return pathItem[httpMethod]['x-permission'] || '';
}

MarkdownGenerator.prototype._getQueryParameters = function (pathItem) {
    return _.filter(pathItem['parameters'], function (param) {
        return param['in'] === 'query';
    });
}

MarkdownGenerator.prototype._getBodyParameters = function (pathItem) {
    let that = this;

    return _(pathItem['parameters'])
        .filter(function (param) {
            return param['in'] === 'body';
        })
        .map(function (body) {
            const returnObj = Object.assign({}, body);
            let schema = returnObj['schema'];
            if (!schema)
                return returnObj;

            let ref = schema['$ref'];
            if (!ref)
                return returnObj;

            let tokens = ref.split('/');
            let typeName = tokens[tokens.length - 1];
            if (!typeName)
                return returnObj;

            returnObj.example = that._definitions[typeName]['example'];

            return returnObj;
        })
        .value()[0];
}

MarkdownGenerator.prototype._getResourceFormattedUrl = function (pathItem) {
    let uri = pathItem._path;

    return uri.replace('{version}', this._version);
}

MarkdownGenerator.prototype._getSampleApiCode = function (pathItem, httpMethod, language) {
    let request = this._buildRequest(httpMethod, pathItem);
    let requestString = this._renderRequest(language, request);

    let returnString =
        '```' + language.code + '\n' +
        requestString + '\n' +
        '```\n\n';

    return returnString;
}

MarkdownGenerator.prototype._buildRequest = function (httpMethod, pathItem) {
    let uri = this._getResourceFormattedUrl(pathItem);
    let headers = {
        'Authorization': 'Bearer {Token}',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    let queryParams = this._getQueryParameters(pathItem[httpMethod]);
    let requestBody = this._getBodyParameters(pathItem[httpMethod]);

    return new Request({
        uri: uri,
        method: httpMethod,
        headers: headers,
        query: queryParams,
        body: requestBody
    });
}

MarkdownGenerator.prototype._renderRequest = function (language, request) {
    let codeSample = generateCodeSample(language, request);
    return codeSample;
}

MarkdownGenerator.prototype._getQueryParametersAsTable = function (httpMethod, pathItem) {
    let queryParams = this._getQueryParameters(pathItem[httpMethod]);
    if (!queryParams || !queryParams.length)
        return '';

    let tableData = [];
    let sortedQueryParams = _.sortBy(queryParams, function (qp) {
        return !qp.required;
    });

    tableData.push('Parameter | Type | Description', '---|---|---');

    _.forEach(sortedQueryParams, queryParam => {
        let row = '`' + queryParam.name;
        if (!queryParam.required) {
            row += ' (optional)';
        }

        row += '`|`' + queryParam.type + '`|' + queryParam.description;
        tableData.push(row);
    });
    tableData.push('&nbsp;|&nbsp;|[See search and pagination for more parameters](#search)')

    return tableData.join('\n') + '\n\n';
}

MarkdownGenerator.prototype._getBodyParametersAsTable = function (httpMethod, pathItem) {
    function getParameterType(prop) {
        if (prop.type) return prop.type;

        let ref = prop['$ref'];
        if (!ref) return;
        let tokens = ref.split('/');
        return tokens[tokens.length - 1];
    };

    let bodyParam = this._getBodyParameters(pathItem[httpMethod]);
    if (!bodyParam)
        return '';

    let tableData = [];
    tableData.push('Parameter | Type | Description', '---|---|---');

    let schema = bodyParam['schema'];
    if (!schema)
        return;

    let typeName = getParameterType(schema);
    if (!typeName)
        return;

    let definition = this._definitions[typeName];
    if (!definition)
        return;

    const properties = definition['properties'];
    if (!properties)
        return;

    let sortedFields = _(properties)
        .map(function (data, propName) {
            return Object.assign({}, data, {
                name: propName,
                required: definition['required'] && _.find(definition['required'], function (r) {
                    return r === propName;
                })
            });
        })
        .orderBy(['required', 'name'], ['asc', 'asc'])
        .value();

    _.forEach(sortedFields, function (field) {
        let row = `\`${field.name}`;
        if (!field.required) {
            row += ' (optional)';
        }

        // TODO: Use link to specific type
        let typeColumnValue = field.type ?
            ('`' + field.type + (field.maxLength ? ('(' + field.maxLength + ')') : '') + (field.format ? (' ' + field.format) : '') + '`') :
            ('`' + getParameterType(field) + '`');

        // row += `\`|${typeColumnValue}|${(field.description || '')}`;
        row += '`|' + typeColumnValue + '|' + (field.description || '');
        tableData.push(row);
    });

    return tableData.join('\n') + '\n\n';
}

MarkdownGenerator.prototype._getPositiveResponse = function (httpMethod, pathItem) {
    const action = pathItem[httpMethod];
    const actionKey = _.filter(Object.keys(action['responses']), function (statusCode) {
        return statusCode.startsWith('2');
    })[0];

    return Object.assign({ statusCode: actionKey }, action['responses'][actionKey]);
}

MarkdownGenerator.prototype._getPositiveResponseExample = function (pathItem, statusCode) {
    const statusCodeResponse = pathItem['responses'][statusCode];
    if (!statusCodeResponse)
        return;
    const examples = statusCodeResponse['examples'];
    let r = examples && _.map(Object.keys(examples), function (contentType) {
        return examples[contentType];
    })[0];

    return r;
}

MarkdownGenerator.prototype._getFirstResponseContentType = function (httpMethod, pathItem) {
    const action = pathItem[httpMethod];
    return action['produces'][0];
}

MarkdownGenerator.prototype._getReturnModelsFromResources = function (pathItemCollection) {
    return _(pathItemCollection).map(function (pathItems, key) {
        return _.map(pathItems, function (pathItem, index) {
            return _.map(pathItem, function (action, httpMethod) {
                let successResponses = _.filter(action['responses'], function (response, statusCode) {
                    return statusCode < 300;
                });

                let returnSchemas = _.map(successResponses, function (response) {
                    let schema = response['schema'];
                    if (!schema) return;

                    let ref = schema['$ref'];
                    if (ref) return ref;

                    let items = schema['items'];
                    if (!items) return;

                    ref = items['$ref'];

                    return ref;
                });

                returnSchemas = _.filter(returnSchemas, function (responseSchema) {
                    return responseSchema;
                });

                return returnSchemas;
            });
        });
    })
        .flattenDeep()
        .compact()
        .uniq()
        .sort()
        .value();
}

MarkdownGenerator.prototype._writeModelDefinitions = function (definitionPaths) {
    let definitionString = this._getModelDefinitions(definitionPaths);

    let outputPath = path.join(path.resolve(path.normalize(this._outputDir)), 'typedefs.md');

    fs.writeFileSync(outputPath, definitionString);
}

MarkdownGenerator.prototype._getModelDefinitions = function (definitionPaths) {
    let self = this;
    let definitionString = _(definitionPaths)
        .sort()
        .map(function (definitionPath) {
            let modelName = '### ' + self._getModelNameFromDefinitionRef(definitionPath) + ' Model';
            let definitionTable = self._getModelDefinitionTable(definitionPath);

            return [modelName, definitionTable].join('\n\n');
        })
        .value();

    return ['## Type Definitions'].concat(definitionString).join('\n\n');
}

MarkdownGenerator.prototype._getModelNameFromDefinitionRef = function (definitionPath) {
    let tokens = definitionPath.split('/');
    return tokens[tokens.length - 1];
}

MarkdownGenerator.prototype._getModelDefinitionTable = function (definitionPath) {
    let tableData = [];
    tableData.push('Parameter | Type | Description', '---|---|---');

    let typeName = this._getModelNameFromDefinitionRef(definitionPath);
    if (!typeName)
        return;

    let definition = this._definitions[typeName];
    if (!definition)
        return;

    const properties = definition['properties'];
    if (!properties)
        return;

    let fields = _(properties)
        .map(function (data, propName) {
            return Object.assign({}, data, {
                name: propName
            });
        })
        .value();

    let self = this;
    _.forEach(fields, function (field) {
        let row = `\`${field.name}`;

        let typeColumnValue = field.type ?
            ('`' + field.type + (field.maxLength ? ('(' + field.maxLength + ')') : '') + (field.format ? (' ' + field.format) : '') + '`') :
            ('[`' + self._getModelNameFromDefinitionRef(field['$ref']) + '`](#' + self._getModelNameFromDefinitionRef(field['$ref'].toLowerCase() + '-model)'));

        row += '`|' + typeColumnValue + '|' + (field.description || '');
        tableData.push(row);
    });

    return tableData.join('\n') + '\n\n';
}

module.exports = MarkdownGenerator;