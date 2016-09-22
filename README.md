# mongodb-migrator

**Table of Contents**

- [Installation](#installation)
- [CLI usage](#cli-usage)
  - [Configuration](#configuration)
    - [Creating Migrations](#creating-migrations)
    - [Sample migration file](#sample-migration-file)
  - [Running migrations](#running-migrations)
  - [Check for new migrations](#check-for-new-migrations)
- [Programmatic usage](#programmatic-usage)
  - [Using `Migrator`](#using-migrator)

## Installation

```bash
$ npm install -g mongodb-migrator
```

## CLI usage

The package installs a single CLI executable — `mdbmigrator`.

When installing locally to your project this executable can be found at
`./node_modules/.bin/mdbmigrator`.

When installing globally the executable should
automatically become accessible on your PATH.

### Configuration

The configuration can be passed as a file (js or json):

```json
// myconfig.json
{
  "mongourl": "mongodb://localhost:27017/migrations",
  "host": "localhost",
  "port": 27017,
  "db": "migrations",
  "user": "username",
  "password": "secret_password",
  "collection": "migrations_track",
  "directory": "migrations"
}
```
```bash
  mdbmigrator --config myconfig.json create mynewmigration
```

or cli arguments:

```bash
  mdbmigrator --host 127.0.0.1 --port 27017 --db migrations create newmigrationname
```

### Creating Migrations

The app simplifies creating migration stubs by providing a command

```bash
$ mdbmigrator create 'migration name'
```

This creates file `migration-name.js` inside of the `directory`
defined in the [configuration](#configuration) file.

#### Sample migration file
```javascript
  module.exports = {
    name: 'migration name',
    after: null
    up: function (db, cb) {
      cb();
    },
    down: function (db, cb) {
      cb();
    }
  }
```
Where

* `migration name` — a unique name for migration.
* `up` — a function used for forward migration.
* `down` — a function used for backward migration.


#### Migration functions

The `up` and `down` functions take for two parameters `db` - mongodb connection and callback `cb`

```javascript
up: function(db, cb) {
  db.collection('users').insertOne({name:"firstadmin",pass:"very_secure_password"}, function (err, result) {
    if(err) return cb(err);
    console.log("all done");
    cb();
  });
}
```

### Running migrations

Applying all new migrations from the `directory` (specified in
[Configuration](#configuration)) by calling


```bash
$ mdbmigrator apply
```

Rollbacks are automatically called in the reverse order when an error occurs.


The library only runs migrations that:

1. have `up` function defined,
1. were not ran before against this database.
1. were rollback at any moment

Successfully applied migrations are recorded in the `collection`
specified in [Configuration](#configuration) and successfully
canceled migrations remove the record from the `collection`.

The migration process is stopped instantly if some migration fails
(returns error in its callback), then beginning roll back process.

### Check for new migrations

```bash
$ mdbmigrator check
```

## Programmatic usage

The library also supports programmatic usage.

Start with `require`'ing it:

```javascript
var MongoMigrator = require('mongodb-migrator');

var migrator = new MongoMigrator(options);

```

### Using `migrator`

Next, you can use migrator instance as was described before:

```javascript

// Load all migrations
var migrationsArray = migrator.loadMigrations();

// Check for circularity's and count new migrations
migrator.check();

// Apply new migrations
migrator.apply();

```

