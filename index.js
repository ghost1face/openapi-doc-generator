var program = require('commander');
var MarkdownGenerator = require('./src/markdownGenerator');

// program.arguments('<file>')
//     .option('-o, -output <outputDir>', 'The directory to output markdown to.', process.cwd())
//     .action(function(file) {
//             var generator = new MarkdownGenerator(file, program.outputDir);
//
//             generator.emit();
//     })
//     .parse(process.argv);


var generator = new MarkdownGenerator('swagger.json', process.cwd());

generator.emit();