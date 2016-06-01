var fs = require("fs");
var uuid = require("uuid");
var path = require("path");
var debug = require("debug")("mongodb-migrator:template");

module.exports = Template;

function Template (slug, afterDeps) {
	this.id = uuid.v4();
	this.slug = slug.trim();
	this.afterDeps = afterDeps || [];
}	

Template.prototype.content = function () {
	var templateContent = fs.readFileSync(path.join(__dirname,"/../resources/template.js"), 'utf-8');
	templateContent = templateContent
		.replace(/\${id}/g, this.id)
		.replace(/\${afterDeps}/g, this.afterDeps.map(function (depid) {
			return "'"+depid+"'";
		}).join(","));
	return templateContent;
}

Template.prototype.saveTo = function (filePath) {
	fs.writeFileSync(filePath, this.content());
}