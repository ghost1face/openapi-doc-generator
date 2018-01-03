const fs = require('fs');
const _ = require('lodash');
const swaggerDoc = JSON.parse(fs.readFileSync('swagger.json', 'utf8'));
const definitions = swaggerDoc.definitions;
const tags = swaggerDoc.tags;
const httpMethods = ["head", "options", "get", "post", "put", "patch", "delete"];
const languages = ['curl', 'cs', 'java'];

const swaggerDocGlobals = {
    title: swaggerDoc.info.title,
    version: swaggerDoc.info.version.replace('v', ''),
    host: swaggerDoc.host,
    schemes: swaggerDoc.schemes
};

const mappedResources = _.map(swaggerDoc.paths, function (data, key) {
    data._path = key;
    return data;
});

/*const filteredSwaggerResources = _.filter(mappedResources, function (path, indexOrKey) {
    return path._path.indexOf('v{version}') > -1;
});*/

const groupedResources = _.groupBy(mappedResources, function (resource) {
    // return resource._path.replace('/v{version}/', '').split('/')[2];

    // let resourceCollectionPathItem = resourceCollection[0];
    // if (!resourceCollectionPathItem)
    //     return '';

    let operationKey = _.filter(Object.keys(resource), key => key !== '_path')[0];
    if (!operationKey)
        return '';

    let operation = resource[operationKey];
    if (!operation)
        return '';

    let primaryTag = operation['tags'][0];
    if (!primaryTag)
        return resource._path.replace('/v{version}/', '').split('/')[2];
    return primaryTag.toLowerCase();
});

// console.log(groupedResources);
_.forEach(groupedResources, function (resource, key) {
    const fileName = key + '.md';

    writeFile(fileName, resource);

    // write file
});


function writeFile(fileName, resourceCollection) {
    let fileContent =
        `## ${getResourceCollectionTitle(resourceCollection)}\n\n` +
        `${getResourceCollectionDescription(resourceCollection)}\n\n`;

    _.forEach(resourceCollection, function (resource) {
        _.forEach(httpMethods, function (httpMethod) {
            let endpoint = resource[httpMethod];

            if (typeof endpoint === 'undefined')
                return;

            fileContent += `### ${(endpoint['x-title'] || endpoint.operationId)}\n\n` +
                getOperationDescription(httpMethod, resource) + '\n\n' +
                `${getEndpointUri(httpMethod, resource)}` +
                '#### Example Request\n\n';

            _.forEach(languages, language => {
                fileContent += getSampleApiCode(resource, httpMethod, language);
            });

            // query parameter definitions
            fileContent += getQueryParametersAsTable(httpMethod, resource);

            // body parameter definitions
            fileContent += getBodyParametersAsTable(httpMethod, resource);

            // response
            const positiveResponse = getPositiveResponse(httpMethod, resource);
            const responseContentType = getFirstResponseContentType(httpMethod, resource);
            fileContent += '#### Example Response\n\n' +
                '```http\n' +
                `HTTP/1.1 ${positiveResponse.statusCode} ${positiveResponse.description}\n` +
                (responseContentType && `Content-Type: ${getFirstResponseContentType(httpMethod, resource)}\n`) +
                '```\n';

            if (positiveResponse.statusCode !== '204') {
                let responseExample = getPositiveResponseExample(resource[httpMethod], positiveResponse.statusCode);
                if (typeof responseExample !== 'undefined') {
                    // if no content build response
                    fileContent += '```json\n' +
                        `${JSON.stringify(responseExample, null, 2)}\n` +
                        '```\n\n';
                }
            }
            else {
                fileContent += '\n';
            }
        });
    });

    fs.writeFileSync(fileName, fileContent);
    console.log(fileContent);
}

function getResourceCollectionTitle(resourceCollection) {
    const action = resourceCollection[0];
    const actionKey = Object.keys(action).filter(function (key) {
        return key !== '_path';
    })[0];

    const fallbackTitle = action[actionKey]['operationId'].split('_')[0];

    let resourceCollectionPathItem = resourceCollection[0];
    if (!resourceCollectionPathItem)
        return fallbackTitle;

    let operationKey = _.filter(Object.keys(resourceCollectionPathItem), key => key !== '_path')[0];
    if (!operationKey)
        return fallbackTitle;

    let operation = resourceCollectionPathItem[operationKey];
    if (!operation)
        return fallbackTitle;

    let primaryTag = operation.tags[0];
    if (!primaryTag)
        return fallbackTitle;

    let detailTag = _.filter(tags, tag => tag.name === primaryTag)[0];
    if (!detailTag)
        return fallbackTitle;

    return (detailTag['x-title'] || '').trim() || fallbackTitle;
}

function getResourceCollectionDescription(resourceCollection) {
    let resourceCollectionPathItem = resourceCollection[0];
    if (!resourceCollectionPathItem)
        return '';

    let operationKey = _.filter(Object.keys(resourceCollectionPathItem), key => key !== '_path')[0];
    if (!operationKey)
        return '';

    let operation = resourceCollectionPathItem[operationKey];
    if (!operation)
        return '';

    let primaryTag = operation.tags[0];
    if (!primaryTag)
        return '';

    let detailTag = _.filter(tags, tag => tag.name === primaryTag)[0];
    if (!detailTag)
        return '';

    return (detailTag.description || '').trim();
}

function getEndpointUri(httpMethod, resource) {
    let params = _.map(getQueryParameters(resource[httpMethod]), p => {
        return `${p['name']}={${p['name'].replace('.', '')}}`;
    });

    if (params && params.length) {
        params = '?\n        ' + params.join('\n        &');
    }

    const result =
        '```endpoint\n' +
        `${httpMethod.toUpperCase()} ${getResourceFormattedUrl(resource)}${params}\n` +
        '```\n\n';

    return result;
}

function getResourceFormattedUrl(resource) {
    const uri = resource._path;

    /*return uri.replace(/{(\w*)}/g, function(match, key) {
        return key.toLowerCase() === 'version' ? swaggerDocGlobals.version : key;
    })*/

    return uri.replace('{version}', swaggerDocGlobals.version);
}

function getSampleApiCode(resource, httpMethod, language) {
    const request = buildRequest(httpMethod, resource);
    const requestString = renderRequest(language, request);

    return '```' + language + '\n' +
        requestString + '\n' +
        '```\n\n';
}

function buildRequest(httpMethod, resource) {
    const uri = getResourceFormattedUrl(resource);
    const headers = {
        'Authorization': 'Bearer {Token}',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    const queryParams = getQueryParameters(resource[httpMethod]);
    const requestBody = getBodyParameters(resource[httpMethod]);

    return new Request({
        uri: uri,
        method: httpMethod,
        headers: headers,
        query: queryParams,
        body: requestBody
    });
}

function getQueryParameters(resourceItem) {
    return _.filter(resourceItem['parameters'], function (param) {
        return param['in'] === 'query';
    });
}

function getBodyParameters(resourceItem) {
    return _(resourceItem['parameters'])
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

            returnObj.example = definitions[typeName]['example'];

            return returnObj;
        })
        .value()[0];
}

function renderRequest(language, request) {
    switch (language) {
        case 'curl':
            return getCURLRequest(request);
        case 'cs':
            return getCSharpRequest(request);
        case 'java':
            return getJavaRequest(request);
        default:
            break;
    }
}

function getCURLRequest(request) {
    let curlified = [];
    let type = '';
    let headers = request.getPart('headers');
    let body = request.getPart('body');
    curlified.push('curl');
    curlified.push('-X', request.getPart('method'));
    curlified.push(`"${request.getPart("uri")}" \\\n`);

    if (headers && headers.size) {
        for (let p of headers.entries()) {
            let [h, v] = p;
            type = v;
            curlified.push(`  -H "${h}: ${v}" \\\n`);
        }
    }

    if (body && body.example) {
        curlified.push(`  -d ${JSON.stringify(body.example).replace(/\\n/g, "")}\\\n`);
    }

    return curlified.join(' ');
}

function getCSharpRequest(request) {
    let csharpified = [];
    let headers = request.getPart('headers');
    let body = request.getPart('body');
    let method = request.getPart('method');
    let uri = request.getPart('uri');
    method = method.charAt(0).toUpperCase() + method.substring(1);
    let indent = 0;
    const indentSpaces = 4;
    const SPACE = ' ';

    csharpified.push('using (var httpClient = new HttpClient())');
    csharpified.push('{');

    indent += indentSpaces;

    csharpified.push(SPACE.repeat(indent) + `var request = new HttpRequestMessage(HttpMethod.${method}, "${uri}");`);

    if (headers && headers.size) {
        for (let p of headers.entries()) {
            let [h, v] = p;

            csharpified.push(SPACE.repeat(indent) + `httpClient.Headers.Add("${h}", "${v}");`);
        }
    }

    if (body && body.example) {
        csharpified.push(SPACE.repeat(indent) + `request.Content = new StringContent(${JSON.stringify(JSON.stringify(body.example)).replace(/\\n/g, "")});`);
    }

    csharpified.push(SPACE.repeat(indent) + `var response = await httpClient.SendAsync(request).ConfigureAwait(false);`);

    csharpified.push('}');

    return csharpified.join('\n');
}

function getJavaRequest(request) {
    let javafied = [];
    let headers = request.getPart('headers');
    let body = request.getPart('body');
    let method = request.getPart('method');
    let uri = request.getPart('uri');

    javafied.push(`URL obj = new URL("${uri}");`);
    javafied.push('HttpsURLConnection con = (HttpsURLConnection) obj.openConnection();');
    javafied.push(`con.setRequestMethod("${method.toUpperCase()}");`);

    if (headers && headers.size) {
        for (let p of headers.entries()) {
            let [h, v] = p;

            javafied.push(`con.setRequestProperty("${h}", "${v}");`);
        }
    }

    if (body && body.example) {
        javafied.push('conn.setDoOutput(true);');
        javafied.push(`String input = ${JSON.stringify(JSON.stringify(body.example)).replace(/\\n/g, "")};`);
        javafied.push('OutputStream os = conn.getOutputStream();');
        javafied.push('os.write(input.getBytes());');
        javafied.push('os.flush();');
    }

    javafied.push('int responseCode = conn.getResponseCode();');

    return javafied.join('\n');
}

function buildMap(obj) {
    const map = new Map();
    Object.keys(obj).forEach(key => {
        map.set(key, obj[key]);
    });
    return map;
}

function getPositiveResponse(httpMethod, resource) {
    const action = resource[httpMethod];
    const actionKey = _.filter(Object.keys(action['responses']), function (statusCode) {
        return statusCode.startsWith('2');
    })[0];

    return Object.assign({statusCode: actionKey}, action['responses'][actionKey]);
}

function getPositiveResponseExample(resourceItem, statusCode) {
    const statusCodeResponse = resourceItem['responses'][statusCode];
    if (!statusCodeResponse)
        return;
    const examples = statusCodeResponse['examples'];
    let r = examples && _.map(Object.keys(examples), function (contentType) {
        return examples[contentType];
    })[0];

    return r;
}

function getFirstResponseContentType(httpMethod, resource) {
    const action = resource[httpMethod];
    return action['produces'][0];
}

function getFirstAcceptedContentType(httpMethod, resource) {
    const action = resource[httpMethod];
    return action['consumes'][0];
}

function getOperationDescription(httpMethod, resource) {
    let operation = resource[httpMethod];
    return operation.description || operation.summary || '';
}

function getQueryParametersAsTable(httpMethod, resource) {
    let queryParams = getQueryParameters(resource[httpMethod]);
    if (!queryParams || !queryParams.length)
        return '';

    let tableData = [];
    let sortedQueryParams = _.sortBy(queryParams, qp => !qp.required);

    tableData.push('Parameter | Type | Description', '---|---|---');
    _.forEach(sortedQueryParams, queryParam => {
        let row = `\`${queryParam.name}`;
        if (!queryParam.required) {
            row += ' (optional)';
        }
        row += `\`|\`${queryParam.type}\`|${queryParam.description}`;
        tableData.push(row);
    });
    tableData.push('&nbsp;|&nbsp;|[See search and pagination for more parameters](#search)')

    return tableData.join('\n') + '\n\n';
}

function getBodyParametersAsTable(httpMethod, resource) {
    const getParameterType = prop => {
        if (prop.type) return prop.type;

        let ref = prop['$ref'];
        if (!ref) return;
        let tokens = ref.split('/');
        return tokens[tokens.length - 1];
    };

    let bodyParam = getBodyParameters(resource[httpMethod]);
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

    const definition = definitions[typeName];
    if (!definition)
        return;

    const properties = definition['properties'];
    if (!properties)
        return;

    let sortedFields = _(properties)
        .map((data, propName) => {
            return Object.assign({}, data, {
                name: propName,
                required: definition['required'] && _.find(definition['required'], r => r === propName)
            });
        })
        .orderBy(['required', 'name'], ['asc', 'asc'])
        .value();

    _.forEach(sortedFields, field => {
        let row = `\`${field.name}`;
        if (!field.required) {
            row += ' (optional)';
        }

        // TODO: Use link to specific type
        let typeColumnValue = field.type ? `\`${field.type}${(field.format ? ` (${field.format})` : '')}\`` : `\`${getParameterType(field)}\``;

        row += `\`|${typeColumnValue}|${(field.description || '')}`;
        tableData.push(row);
    });

    // _.forEach(properties, (data, propName) => {
    //     let row = `\`${propName}`;
    //     if (!definition['required'] || !_.find(definition['required'], r => r === propName)) {
    //         row += ' (optional)';
    //     }
    //
    //     // TODO: Use link to specific type
    //     let typeColumnValue = data.type ? `\`${data.type}${(data.format ? ` (${data.format})` : '')}\`` : `\`${getParameterType(data)}\``;
    //
    //     row += `\`|${typeColumnValue}|${(data.description || '')}`;
    //     tableData.push(row);
    // });

    return tableData.join('\n') + '\n\n';
    // let sortedBodyParams = _.sortBy(bodyParams, bp => !bp.required);

    /*
    _.forEach(sortedBodyParams, bodyParam => {
        let schema = bodyParam['schema'];
        if (!schema)
            return;

        let ref = schema['$ref'];
        if (!ref)
            return;

        let tokens = ref.split('/');
        let typeName = tokens[tokens.length - 1];
        if (!typeName)
            return;

        const definition = definitions[typeName];
        if (!definition)
            return;

        const properties = definition['properties'];
        if (!properties)
            return;

        _.forEach(properties, (data, propName) => {
            let row = `\`${propName}`;
            if (!data.required) {
                row += ' (optional)';
            }
            row += `\`|\`${data.type}\`|${data.description}`;
            tableData.push(row);
        });

        return tableData.join('\n') + '\n\n';
    });*/
}

function Request(data, definitions) {
    this.uri = data.uri;
    this.method = data.method.toUpperCase();
    this.headers = buildMap(data.headers);
    this.query = data.query;
    this.body = data.body;

    this.getPart = function (key) {
        return this[key];
    }
}
