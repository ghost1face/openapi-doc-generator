function getCURLRequest(request) {
    let curlified = [];
    let type = '';
    let headers = request.getPart('headers');
    let body = request.getPart('body');
    curlified.push('curl');
    curlified.push('-X', request.getPart('method'));
    curlified.push(request.getPart("uri") + ' \\\n');

    if (headers && headers.size) {
        for (let p of headers.entries()) {
            let [h, v] = p;
            type = v;
            curlified.push('  -H "' + h + ': ' + v + '" \\\n');
        }
    }

    if (body && body.example) {
        curlified.push('  -d ' + JSON.stringify(body.example).replace(/\\n/g, "") + ' \\\n');
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

    csharpified.push(SPACE.repeat(indent) + 'var request = new HttpRequestMessage(HttpMethod.' + method + ', "' + uri + '");');

    if (headers && headers.size) {
        for (let p of headers.entries()) {
            let [h, v] = p;

            csharpified.push(SPACE.repeat(indent) + 'httpClient.Headers.Add("' + h + '", "' + v + '");');
        }
    }

    if (body && body.example) {
        csharpified.push(SPACE.repeat(indent) + 'request.Content = new StringContent(' + JSON.stringify(JSON.stringify(body.example)).replace(/\\n/g, "") + ');');
    }

    csharpified.push(SPACE.repeat(indent) + 'var response = await httpClient.SendAsync(request).ConfigureAwait(false);');

    csharpified.push('}');

    return csharpified.join('\n');
}

function getJavaRequest(request) {
    let javafied = [];
    let headers = request.getPart('headers');
    let body = request.getPart('body');
    let method = request.getPart('method');
    let uri = request.getPart('uri');

    javafied.push('URL obj = new URL("' + uri + '");');
    javafied.push('HttpsURLConnection con = (HttpsURLConnection) obj.openConnection();');
    javafied.push('con.setRequestMethod("' + method.toUpperCase() + '");');

    if (headers && headers.size) {
        for (let p of headers.entries()) {
            let [h, v] = p;

            javafied.push('con.setRequestProperty("' + h + '", "' + v + '");');
        }
    }

    if (body && body.example) {
        javafied.push('conn.setDoOutput(true);');
        javafied.push('String input = JSON.stringify(JSON.stringify(body.example)).replace(/\\n/g, "");');
        javafied.push('OutputStream os = conn.getOutputStream();');
        javafied.push('os.write(input.getBytes());');
        javafied.push('os.flush();');
    }

    javafied.push('int responseCode = conn.getResponseCode();');

    return javafied.join('\n');
}

function renderRequest(language, request) {
    var output;
    switch (language.code) {
        case 'curl':
            output = getCURLRequest(request);
            break;
        case 'cs':
            output = getCSharpRequest(request);
            break;
        case 'java':
            output = getJavaRequest(request);
            break;
        default:
            break;
    }

    return output;
}

module.exports = renderRequest;