var fs = require("fs");
var path = require("path");
var debug = require("debug")("mongodb-migrator:template.js");

module.exports = Template;

function Template (name, after) {
	this.name = name.trim();
	this.after = after || [];
}	

Template.prototype.content = function () {
	var templateContent = fs.readFileSync(path.join(__dirname,"/../resources/template.js"), 'utf-8');
	templateContent = templateContent
		.replace(/\${name}/g, this.name)
		.replace(/\${after}/g, this.after.map(function (depid) {
			return "'"+depid+"'";
		}).join(","));
	return templateContent;
}

Template.prototype.saveTo = function (filePath) {
	fs.writeFileSync(filePath, this.content());
}