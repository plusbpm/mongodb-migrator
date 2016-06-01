var fs = require("fs");
var mkdirp = require("mkdirp");

var uuid = require("uuid");
var path = require("path");
var debug = require("debug")("mongodb-migrator");

var defaultOptions = require("./defaults");
var Template = require("./template");

module.exports = MongodbMigrator;

function MongodbMigrator (options) {
	if(!options) {
		throw("Нужно указать опции в качестве аргумента.");
	}
	if(!options.host && !options.mongourl) {
		throw("В опциях должен быть mongourl либо host");
	}
	this.db = null;
	this.opts = Object.assign({}, defaultOptions, options);

	mkdirp.sync(this.opts.directory);
}

MongodbMigrator.prototype.makeSlug = function (name) {
	return name.replace(/\s+/g,"-");
}

MongodbMigrator.prototype.filePath = function (name) {
	return path.join(this.opts.directory,this.makeSlug(name)+"."+this.opts.extention)
}

MongodbMigrator.prototype.exists = function (name) {
	try{
		fs.statSync(this.filePath(name));
		return true;
	} catch(e) {
		return false;
	}
}

MongodbMigrator.prototype.create = function (name, afterDeps) {
	if(!afterDeps) {
		afterDeps = [];
	}

	if(this.exists(name)) {
		throw("Миграция '"+name+"' уже существует.")
	}

	var migration = new Template(name, afterDeps);

	migration.saveTo(this.filePath(name));

	debug("Миграция создана "+name);
}