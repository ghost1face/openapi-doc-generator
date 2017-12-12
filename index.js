const fs = require('fs');
const _ = require('lodash');
const swaggerDoc = JSON.parse(fs.readFileSync('swagger.json', 'utf8'));
const definitions = swaggerDoc.definitions;
const httpMethods = ["head", "options", "get", "post", "put", "patch", "delete"];
const languages = ['curl'];

const swaggerDocGlobals = {
    title: swaggerDoc.info.title,
    version: swaggerDoc.info.version.replace('v', ''),
    host: swaggerDoc.host,
    schemes: swaggerDoc.schemes
};

// var swaggerResources = _(swaggerDoc.paths)
//     .filter(function(path, indexOrKey, collection) {
//         return indexOrKey.indexOf('v{version}') > -1;
//     })
//     .groupBy(function(path) {
//         return path.replace('/v{version}', '').split('/')[0];
//     })
//     .value();

const mappedResources = _.map(swaggerDoc.paths, function (data, key) {
    data._key = key;
    return data;
});

const filteredSwaggerResources = _.filter(mappedResources, function (path, indexOrKey) {
    return path._key.indexOf('v{version}') > -1;
});

const groupedResources = _.groupBy(filteredSwaggerResources, function (resource) {
    return resource._key.replace('/v{version}/', '').split('/')[0];
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

    _.forEach(resourceCollection, function(resource) {
        _.forEach(httpMethods, function (httpMethod) {
            let endpoint = resource[httpMethod];

            if (typeof endpoint === 'undefined')
                return;

            fileContent += `### ${endpoint.operationId}\n\n` +
                // TODO: endpoint description here
                `${getEndpointUri(httpMethod, resource)}` +
                '#### Example Request\n\n';


            _.forEach(languages, function(language) {
                fileContent += getSampleApiCode(resource, httpMethod, language);
            });

            // parameter definitions

            // response
            const positiveResponse = getPositiveResponse(httpMethod, resource);
            const responseContentType = getFirstResponseContentType(httpMethod, resource);
            fileContent += '#### Example Response\n\n' +
                '```http\n' +
                `HTTP/1.1 ${positiveResponse.statusCode} ${positiveResponse.description}\n` +
                (responseContentType && `Content-Type: ${getFirstResponseContentType(httpMethod, resource)}\n`) +
                '```\n\n';

            if (positiveResponse.statusCode !== '204') {
                // if no content build response
            }
        });
    });

    fs.writeFileSync(fileName, fileContent);
    console.log(fileContent);
}

function getResourceCollectionTitle(resourceCollection) {
    const action = resourceCollection[0];
    const actionKey = Object.keys(action).filter(function (key) {
        return key !== '_key';
    })[0];

    return action[actionKey]['operationId'].split('_')[0];
}

function getResourceCollectionDescription(resourceCollection) {
    return '';  // TODO: Use external json file that uses first part of operationid key,  Auth_Dostuff, key from Auth, value would have description maintained externally
}

function getEndpointUri(httpMethod, resource) {
    let params = _.map(getQueryParameters(resource[httpMethod]), p => {
       return `${p['name']}={${p['name'].replace('.')}}`;
    });

    if (params && params.length) {
        params = '?' + params.join('\n&');
    }

    const result =
        '```endpoint\n' +
        `${httpMethod.toUpperCase()} ${getResourceFormattedUrl(resource)}${params}\n` +
        '```\n\n';

    return result;
}

function getResourceFormattedUrl(resource){
    const uri = resource._key;

    /*return uri.replace(/{(\w*)}/g, function(match, key) {
        return key.toLowerCase() === 'version' ? swaggerDocGlobals.version : key;
    })*/

    return uri.replace('{version}', swaggerDocGlobals.version);
}

function getSampleApiCode(resource, httpMethod, language) {
    const request = buildRequest(httpMethod, resource);
    const requestString =renderRequest(language, request);

    return '```' + language + '\n' +
    requestString + '\n' +
    '```\n\n';
}

function buildRequest(httpMethod, resource) {
    const uri = getResourceFormattedUrl(resource);
    const headers = {
        'Authorization': 'Bearer {Token}',
        'Accept': 'application/json, text/json'
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
    return _.filter(resourceItem['parameters'], function(param) {
        return param['in'] === 'query';
    });
}

function getBodyParameters(resourceItem) {
    return _.filter(resourceItem['parameters'], function(param) {
       return param['in'] === 'body';
    });
}

function renderRequest(language, request) {
    switch (language) {
        case 'curl':
            return getCURLRequest(request);

        default:
            break;
    }
}

function getCURLRequest(request) {
    let curlified = [];
    let type = '';
    let headers = request.getPart('headers');
    let body = request.getPart('body');
    curlified.push( 'curl');
    curlified.push('-X', request.getPart('method'));
    curlified.push(`"${request.getPart("uri")}"`);

    if (headers && headers.size) {
        for (let p of headers.entries()) {
            let [h,v] = p;
            type = v;
            curlified.push( '-H');
            curlified.push( `"${h}: ${v}"`);
        }
    }

    if (body) {
        // TODO: Finish this:  https://raw.githubusercontent.com/swagger-api/swagger-ui/master/src/core/curlify.js
    }

    return curlified.join(' ');
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
    const actionKey = _.filter(Object.keys(action['responses']), function(statusCode) {
        return statusCode.startsWith('2');
    })[0];

    return Object.assign( { statusCode: actionKey}, action['responses'][actionKey] );
}

function getFirstResponseContentType(httpMethod, resource) {
    const action = resource[httpMethod];
    return action['produces'][0];
}

function getFirstAcceptedContentType(httpMethod, resource) {
    const action = resource[httpMethod];
    return action['consumes'][0];
}

function Request(data, definitions) {
    this.uri = data.uri;
    this.method = data.method.toUpperCase();
    this.headers = buildMap(data.headers);
    this.query = data.query;
    this.body = data.body;

    this.getPart = function(key) {
        return this[key];
    }
}
