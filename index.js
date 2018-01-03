var program = require('commander');
var path = require('path');
var MarkdownGenerator = require('./src/markdownGenerator');

function runApp(filePath, outputDir) {
    new MarkdownGenerator(filePath, outputDir)
        .emit();
}

program.arguments('<file>')
    .option('-o, -output <outputDir>', 'The directory to output markdown to.', process.cwd())
    .action(function (file) {
        file = path.normalize(file);

        runApp(file, program.outputDir);
    })
    .parse(process.argv);