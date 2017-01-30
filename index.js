var path = require('path');
var semver = require('semver');
var async = require('async');
var exec = require('child_process').exec;
var _ = require('@sailshq/lodash');
var jsBeautify = require('js-beautify');
var walk = require('walk');
var figlet = require('figlet');

var includeAll = require('include-all');
var Prompts = require('machinepack-prompts');
var Filesystem = require('machinepack-fs');

var INVALID_VALIDATIONS = require('./invalid-validations');

module.exports = (function() {

  // Get the project directory.
  var projectDir = process.cwd();

  console.log();
  console.log('----------------------------------------------------');
  console.log('This utility will kickstart the process of migrating');
  console.log('a pre-Sails-1.0 app to Sails 1.0.x.');
  console.log('----------------------------------------------------');
  console.log();

  return {
    before: function before(scope, done) {

      // Don't say "Created a new migrate-app!" at the end of all this.
      scope.suppressFinalLog = true;

      scope.force = true;

      // Declare a var to hold all the tasks we want to run.
      var tasks = [];

      // Load up the project's package.json file.
      var projectPackageJson = (function() {
        try {
          return require(path.resolve(projectDir, 'package.json'));
        } catch (e) {
          return done(new Error('Could not find a package.json in the current folder.  Are you sure this is a Sails app?'));
        }
      })();

      if (!projectPackageJson.dependencies || !projectPackageJson.dependencies.sails) {
        return done(new Error('This project does not include sails as a dependency.  Are you sure this is a Sails app?'));
      }

      // Load up the existing `config/globals.js` file, if any.
      var globalsConfig = (function() {
        try {
          return require(path.resolve(projectDir, 'config', 'globals')).globals;
        } catch (e) {
          return {};
        }
      })();

      // Load up the existing `config/globals.js` file, if any.
      var modelsConfig = (function() {
        try {
          return require(path.resolve(projectDir, 'config', 'models')).models;
        } catch (e) {
          return {};
        }
      })();

      // Load up the existing `config/connections.js` file, if any.
      var connectionsConfig = (function() {
        try {
          return require(path.resolve(projectDir, 'config', 'connections')).connections;
        } catch (e) {
          return {};
        }
      })();

      //  ██████╗ ██╗   ██╗██╗██╗     ██████╗     ████████╗ █████╗ ███████╗██╗  ██╗███████╗
      //  ██╔══██╗██║   ██║██║██║     ██╔══██╗    ╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔════╝
      //  ██████╔╝██║   ██║██║██║     ██║  ██║       ██║   ███████║███████╗█████╔╝ ███████╗
      //  ██╔══██╗██║   ██║██║██║     ██║  ██║       ██║   ██╔══██║╚════██║██╔═██╗ ╚════██║
      //  ██████╔╝╚██████╔╝██║███████╗██████╔╝       ██║   ██║  ██║███████║██║  ██╗███████║
      //  ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝        ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝

      //  ┬┌┐┌┌─┐┌┬┐┌─┐┬  ┬    ┌─┐┌─┐┬┬  ┌─┐
      //  ││││└─┐ │ ├─┤│  │    └─┐├─┤││  └─┐
      //  ┴┘└┘└─┘ ┴ ┴ ┴┴─┘┴─┘  └─┘┴ ┴┴┴─┘└─┘

      if (!semver.satisfies(projectPackageJson.dependencies['sails'].replace(/^\D+/,''), '^1.0.0-0')) {

        tasks.push(function(done) {

          Prompts.confirm({
            message: 'First things first -- looks like we need to install Sails 1.0.\n\n'+
                      'Is that okay?'
          }).exec({
            no: function() {
              console.log('Okay, exiting for now.  Run `sails generate migrate-app` again when you\'re ready to migrate to Sails 1.0!\n');
              process.exit(0);
            },
            success: function() {
              console.log('Okay -- installing now (please wait)!\n');
              exec('npm install sails@^1.0.0-0 --save', {cwd: projectDir}, done);
            },
            error: done
          });
        });

      }

      //  ┬┌┐┌┌─┐┌┬┐┌─┐┬  ┬    ┌─┐┌─┐┌─┐┬┌─┌─┐┌─┐┌─┐┌─┐
      //  ││││└─┐ │ ├─┤│  │    ├─┘├─┤│  ├┴┐├─┤│ ┬├┤ └─┐
      //  ┴┘└┘└─┘ ┴ ┴ ┴┴─┘┴─┘  ┴  ┴ ┴└─┘┴ ┴┴ ┴└─┘└─┘└─┘

      // Declare a var to hold the dictionary of packages we need to install.
      var packagesToInstall = {};

      if (!projectPackageJson.dependencies['sails-hook-orm'] || !semver.satisfies(projectPackageJson.dependencies['sails-hook-orm'].replace(/^\D+/,''), '^2.0.0-0')) {
        packagesToInstall['sails-hook-orm'] = '^2.0.0-0';
      }

      if (!projectPackageJson.dependencies['sails-hook-grunt']) {
        packagesToInstall['sails-hook-grunt'] = '^1.0.0-0';
      }

      if (!projectPackageJson.dependencies['sails-hook-sockets'] || !semver.satisfies(projectPackageJson.dependencies['sails-hook-sockets'].replace(/^\D+/,''), '^1.0.0-0')) {
        packagesToInstall['sails-hook-sockets'] = '^1.0.0-0';
      }

      if (projectPackageJson.dependencies['sails-postgresql'] && !semver.satisfies(projectPackageJson.dependencies['sails-postgresql'].replace(/^\D+/,''), '^1.0.0-0')) {
        packagesToInstall['sails-postgresql'] = '^1.0.0-0';
      }

      if (projectPackageJson.dependencies['sails-mysql'] && !semver.satisfies(projectPackageJson.dependencies['sails-mysql'].replace(/^\D+/,''), '^1.0.0-0')) {
        packagesToInstall['sails-mysql'] = '^1.0.0-0';
      }

      if (projectPackageJson.dependencies['sails-mongo'] && !semver.satisfies(projectPackageJson.dependencies['sails-mongo'].replace(/^\D+/,''), '^1.0.0-0')) {
        packagesToInstall['sails-mongo'] = '^1.0.0-0';
      }

      if (projectPackageJson.dependencies['socket.io-redis'] && !semver.satisfies(projectPackageJson.dependencies['socket.io-redis'].replace(/^\D+/,''), '^3.1.0')) {
        packagesToInstall['socket.io-redis'] = '3.1.0';
      }

      if (globalsConfig._ !== false && !projectPackageJson.dependencies['lodash']) {
        packagesToInstall['lodash'] = '3.10.1';
      }

      if (globalsConfig.async !== false && !projectPackageJson.dependencies['async']) {
        packagesToInstall['async'] = '2.1.4';
      }

      // If we have stuff to install, confirm with the user, and then do it.
      if (_.keys(packagesToInstall).length) {

        tasks.push(function(done) {
          var packageList = _.map(packagesToInstall, function(ver, package) {
            return package + '@' + ver.replace(/-0$/,'');
          }).join('\n');
          Prompts.confirm({
            message: 'Looks like we need to install the following packages: \n\n' +
                      packageList + '\n\n' +
                      'Is that okay?'
          }).exec({
            no: function() {
              console.log('Okay, but your app may not lift without them!\n');
              return done();
            },
            success: function() {
              console.log('Okay -- installing now!\n');
              async.eachSeries(_.keys(packagesToInstall), function(package, cb) {
                var version = packagesToInstall[package];
                console.log('Installing ' + package + '@' + version.replace(/-0$/,'') + '...');
                exec('npm install ' + package + '@' + version + ' --save' + (version[0] !== '^' ? ' --save-exact' : ''), {cwd: projectDir}, cb);
              }, done);
            },
            error: done
          });

        });

      }

      //  ┬─┐┌─┐┌┬┐┌─┐┬  ┬┌─┐  ┌─┐┌─┐┌─┐┬┌─┌─┐┌─┐┌─┐┌─┐
      //  ├┬┘├┤ ││││ │└┐┌┘├┤   ├─┘├─┤│  ├┴┐├─┤│ ┬├┤ └─┐
      //  ┴└─└─┘┴ ┴└─┘ └┘ └─┘  ┴  ┴ ┴└─┘┴ ┴┴ ┴└─┘└─┘└─┘

      // Get an array of packages we can remove.
      // var packagesToRemove = _.intersection(_.keys(projectPackageJson.dependencies), [
      //   // 'ejs',
      //   'grunt-contrib-clean',
      //   'grunt-contrib-coffee',
      //   'grunt-contrib-concat',
      //   'grunt-contrib-copy',
      //   'grunt-contrib-cssmin',
      //   'grunt-contrib-jst',
      //   'grunt-contrib-less',
      //   'grunt-contrib-uglify',
      //   'grunt-contrib-watch',
      //   'grunt-sails-linker',
      //   'grunt-sync',
      //   'sails-disk'
      // ]);

      // // If we have stuff to install, confirm with the user, and then do it.
      // if (packagesToRemove.length) {

      //   tasks.push(function(done) {
      //     Prompts.confirm({
      //       message: 'Looks like we can remove the following packages: \n\n' +
      //                 packagesToRemove.join('\n') + '\n\n' +
      //                 'These packages are now built-in to Sails.  Removing is strictly optional, but will reduce your app\'s file size.\n\nOkay to remove the packages?'
      //     }).exec({
      //       no: function() {
      //         console.log('Okay, no problem -- we\'ll leave those packages in place!\n');
      //         return done();
      //       },
      //       success: function() {
      //         console.log('Okay -- removing now!\n');
      //         async.eachSeries(packagesToRemove, function(package, cb) {
      //           console.log('Removing ' + package + '...');
      //           exec('npm uninstall ' + package + ' --save', {cwd: projectDir}, cb);
      //         }, done);
      //       },
      //       error: done
      //     });

      //   });

      // }

      //  ┌─┐┬  ┌─┐┌┐ ┌─┐┬    ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
      //  │ ┬│  │ │├┴┐├─┤│    │  │ ││││├┤ ││ ┬
      //  └─┘┴─┘└─┘└─┘┴ ┴┴─┘  └─┘└─┘┘└┘└  ┴└─┘

      // Unless everything in the current global config is turned off, offer to replace the globals.js file.
      if (globalsConfig !== false && (globalsConfig._ !== false || globalsConfig.async !== false || globalsConfig.models !== false || globalsConfig.sails !== false)) {

        tasks.push(function(done) {

          Prompts.confirm({
            message: 'In order for your app to lift, your `config/globals.js` file needs to be updated.\n' +
                     'We can update it for you (and back up your original file).\n'+
                     'See http://bit.ly/sails_migration_checklist for more info.\n\n'+
                     'Update `config/globals.js` file now?'
          }).exec({
            no: function() {
              console.log('Okay, but your app may not lift without it!\n');
              return done();
            },
            success: function() {
              console.log('Okay -- updating now!\n');

              // Back up original file
              Filesystem.mv({
                source: path.resolve(projectDir, 'config', 'globals.js'),
                destination: path.resolve(projectDir, 'config', 'globals-old.js.txt')
              }).exec(function(err) {
                if (err) {
                  if (err.code === 'EEXIST') {
                    console.log('Detected an existing backed-up globals file, so keeping that one...');
                  } else {
                    return done(err);
                  }
                }


                // Get the template for the new globals config file.
                var globalsTemplate = Filesystem.readSync({source: path.resolve(__dirname, 'templates', 'config-globals-1.0.js.template')}).execSync();

                // Fill out the template with the appropriate values based on the project's existing global config.
                var newGlobalsConfig = _.template(globalsTemplate)({
                  lodashVal: globalsConfig._ === false ? false : 'require(\'lodash\')',
                  asyncVal: globalsConfig.async === false ? false : 'require(\'async\')',
                  modelsVal: globalsConfig.models === false ? false : true,
                  sailsVal: globalsConfig.sails === false ? false : true
                });

                try {
                  Filesystem.writeSync({
                    string: newGlobalsConfig,
                    destination: path.resolve(projectDir, 'config', 'globals.js'),
                    force: true
                  }).execSync();
                } catch (e) {
                  return done(e);
                }
                return done();

              });
            },
            error: done
          });

        });

      }

      //  ┌┬┐┌─┐┌┬┐┌─┐┬  ┌─┐  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
      //  ││││ │ ││├┤ │  └─┐  │  │ ││││├┤ ││ ┬
      //  ┴ ┴└─┘─┴┘└─┘┴─┘└─┘  └─┘└─┘┘└┘└  ┴└─┘

      tasks.push(function(done) {

        Prompts.confirm({
          message: 'If your app uses models, you will likely need to update your `config/models.js`\n'+
                   'before lifting with Sails 1.0.  We can add a new `config/models_1.0.js` file for now\n'+
                   'which should allow your app to lift, and then when you\'re ready you merge that\n'+
                   'file with your existing `config/models.js`.\n\n'+
                   'See http://bit.ly/sails_migration_model_config for more info.\n\n'+
                   'Create a new `config/models_1.0.js file now?'
        }).exec({
          no: function() {
            console.log('Okay, but your app may not lift without it!\n');
            return done();
          },
          success: function() {
            console.log('Okay -- creating now!\n');

            // Get the template for the new globals config file.
            var modelsConfigTemplate = Filesystem.readSync({source: path.resolve(__dirname, 'templates', 'config-models-1.0.js.template')}).execSync();

            // Fill out the template with the appropriate values based on the project's existing global config.
            var newModelsConfig = _.template(modelsConfigTemplate)({
              datastore: (modelsConfig.connection !== 'localDiskDb' ? modelsConfig.connection : 'default') || 'default'
            });

            try {
              Filesystem.writeSync({
                string: newModelsConfig,
                destination: path.resolve(projectDir, 'config', 'models_1.0.js'),
                force: true
              }).execSync();
            } catch (e) {
              return done(e);
            }
            return done();
          },
          error: done
        });

      });

      // Declare a var to hold the model definitions.
      var models;

      // Get all the model definitions into `models`
      tasks.push(function(done) {

        // Load all model files, so we know what we're dealing with.
        includeAll.optional({
          dirname: path.resolve(projectDir, 'api', 'models'),
          filter: /^([^.]+)\.(?:(?!md|txt).)+$/,
          replaceExpr : /^.*\//,
        }, function(err, _models) {
          models = _models;
          return done();
        });

      });

      //  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐┌─┐  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
      //   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤ └─┐  │  │ ││││├┤ ││ ┬
      //  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘└─┘  └─┘└─┘┘└┘└  ┴└─┘

      if (_.keys(connectionsConfig).length) {
        tasks.push(function(done) {

          Prompts.confirm({
            message: 'The `connections` configuration has been changed to `datastores` in Sails 1.0.\n'+
                     'In addition, _all_ configured datastores will now always be loaded, even if no models\n'+
                     'are actually using them.  We can migrate your existing `config/connections.js` file over\n'+
                     'to `config/datastores.js` for you (and back up the original file).\n\n'+
                     'See http://bit.ly/sails_migration_datastore_config for more info.\n\n'+
                     'Update `config/connections.js` to `config/datastores.js now?'
          }).exec({
            no: function() {
              console.log('Okay, but your app may not lift without it!\n');
              return done();
            },
            success: function() {
              console.log('Okay -- updating now!\n');

              // Build up a list of datastores that are actually in use.
              var datastoresInUse = [];
              if (modelsConfig.connection && modelsConfig.connection !== 'localDiskDb') {
                datastoresInUse.push(modelsConfig.connection);
              }
              _.each(models, function(model) {
                if (model.connection) {
                  datastoresInUse.push(model.connection);
                }
              });

              // Build up a datastores dictionary
              var datastoresStr = _.reduce(datastoresInUse, function(memo, datastoreInUse) {
                if (connectionsConfig[datastoreInUse]) {
                  memo.push('\'' + datastoreInUse + '\': ' + require('util').inspect(connectionsConfig[datastoreInUse], {depth: null}));
                }
                return memo;
              }, []).join(',\n');

              // Get the template for the new globals config file.
              var datastoresConfigTemplate = Filesystem.readSync({source: path.resolve(__dirname, 'templates', 'config-datastores-1.0.js.template')}).execSync();

              // Fill out the template with the appropriate values based on the project's existing global config.
              var newDatastoresConfig = _.template(datastoresConfigTemplate)({
                datastores: jsBeautify('  ' + datastoresStr, {indent_level: 2, indent_size: 2})
              });

              try {
                Filesystem.writeSync({
                  string: newDatastoresConfig,
                  destination: path.resolve(projectDir, 'config', 'datastores.js'),
                  force: true
                }).execSync();
                Filesystem.mv({
                  source: path.resolve(projectDir, 'config', 'connections.js'),
                  destination: path.resolve(projectDir, 'config', 'connections-old.js.txt')
                }).exec(function(err) {
                  if (err) {
                    if (err.code === 'EEXIST') {
                      console.log('Detected an existing backed-up globals file, so keeping that one...');
                    } else {
                      return done(err);
                    }
                  }

                  return done();
                });
              } catch (e) {
                return done(e);
              }
            },
            error: done
          });


        });

      }

      //  ┌─┐┬ ┬┌─┐┌─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
      //  └─┐│ ││ ┬│ ┬├┤ └─┐ │ ││ ││││└─┐
      //  └─┘└─┘└─┘└─┘└─┘└─┘ ┴ ┴└─┘┘└┘└─┘

      tasks.push(function(done) {

        Prompts.confirm({
          message: 'Okay, that\'s about all we can do automatically.\n\n' +
                   'In the next step, we\'ll do a scan of your code and create a report\n'+
                   'of things that may need to be manually updated for Sails 1.0.\n'+
                   'This could take a few moments depending on the size of your app.\n\n'+
                   'Go ahead and scan your app?'
        }).exec({
          error: done,
          no: function() {
            console.log('Okay, no problem.  In that case we\'re done!');
            return done();
          },
          success: function() {

            // Declare a var to hold the report.
            var report = [];

            // First, do any models have instance methods on them?
            var modelsWithInstanceMethods = _.reduce(models, function(memo, model) {
              if (model.attributes && _.any(model.attributes, function(attribute) {
                return _.isFunction(attribute);
              })) {
                memo.push(model.globalId);
              }
              return memo;
            }, []);

            // If so, add something to the report.
            if (modelsWithInstanceMethods.length) {
              report.push(figlet.textSync('model methods', {font: 'Calvin S'}));
              report.push('In Sails 1.0, models may not longer have instance methods (including `toJSON`).\n'+
                          'You\'ll need to remove instance methods from the following models:\n\n'+
                          _.map(modelsWithInstanceMethods, function(modelName) { return '* "' + modelName + '" in api/models/'+modelName+'.js'; }).join('\n'));
            }

            // Alright, let's take a look at the views config.
            var viewsConfig = (function() {
              try {
                return require(path.resolve(projectDir, 'config', 'views')).views;
              } catch (e) {
                return {};
              }
            })();

            // If it has an `engine` other than `ejs`, add it to the report.
            if (viewsConfig.engine && viewsConfig.engine !== 'ejs') {
              report.push(figlet.textSync('view engines', {font: 'Calvin S'}));
              report.push('It looks like you\'re using the `' + viewsConfig.engine + '` view engine.\n'+
                          'Configuration for view engines has changed in Sails 1.0, so you\'ll want to\n'+
                          'update your `config/views.js` file accordingly.\n\n'+
                          'See http://bit.ly/sails_migration_views for more info.');
            }

            // Declare a var to hold a list of `collection` attributes in models
            // so we can look for `.add` and `.remove` calls.
            var collectionAttributes = [];
            // Declare a var to hold a report of model attributes with outdated validations.
            var outdatedValidationsReport = {};

            // Loop over the models and look for trouble.
            _.each(models, function(model) {

              // Loop over each model attribute
              _.each(model.attributes, function(attribute, name) {
                // If the attribute is a collection, add it to the `collectionAttributes` list.
                if (attribute.collection) {collectionAttributes.push(name);}
                // If the attribute has any out-of-date validations, record them.
                var outdatedValidations = _.intersection(_.keys(INVALID_VALIDATIONS), _.keys(attribute));
                if (outdatedValidations.length) {
                  outdatedValidationsReport[model.globalId] = outdatedValidationsReport[model.globalId] || {};
                  outdatedValidationsReport[model.globalId][name] = outdatedValidations;
                }
              });

            });

            collectionAttributes = _.uniq(collectionAttributes);

            var addRegex = new RegExp('\\.(' + collectionAttributes.join('|') + ')\\.add\\(');
            var removeRegex = new RegExp('\\.(' + collectionAttributes.join('|') + ')\\.remove\\(');

            // Set up various subreports
            var addRemoveSaveCalls = [];
            var csrfTokenPathRefs = false;

            // Start walking the codez
            var walker = walk.walk(projectDir, { filters: ['node_modules', '.tmp'] });

            // For each file...
            walker.on('file', function (root, stats, next) {

              var relativeRoot = root.replace(projectDir, '').replace(new RegExp('^' + path.sep), '');

              // If it's not a Javascript file, skip it.
              if (!stats.name.match(/\.js$/)) {
                 return next();
              }

              // Read the file in.
              var file;
              try {
                file = Filesystem.readSync({source: path.join(root, stats.name)}).execSync().split('\n');
              }
              catch (e) {
                return next();
              }

              // Loop through each line of the file
              _.each(file, function(line, lineNum) {

                // If it's not an asset file, look for `.add` or `.remove` calls.
                if (!root.match(path.join(projectDir, 'assets'))) {
                  if (line.match(addRegex)) {
                    addRemoveSaveCalls.push('.add() in ' + path.join(relativeRoot, stats.name) + ':' + (lineNum + 1));
                  }
                  if (line.match(removeRegex)) {
                    addRemoveSaveCalls.push('.remove() in ' + path.join(relativeRoot, stats.name) + ':' + (lineNum + 1));
                  }
                  if (line.match('\\.save\\(')) {
                    addRemoveSaveCalls.push('.save() in ' + path.join(relativeRoot, stats.name) + ':' + (lineNum + 1));
                  }

                }

                // Look for references to `/csrfToken` (that aren't commented out)
                if (line.match('/csrfToken') && !line.match(/^\s*\/\//) && !line.match(/^\s*\*/)) {
                  csrfTokenPathRefs = true;
                }

              });


              return next();

            });

            walker.on('end', function() {

              if (csrfTokenPathRefs === true) {
                report.push(figlet.textSync('csrfToken route', {font: 'Calvin S'}));
                report.push('In Sails 1.0, the /csrfToken route is no longer added automatically.\n' +
                            'It looks like you\'re using that route in one or more places, so be sure to add it\n' +
                            'to your `config/routes.js` file as:\n\n'+
                            '\'GET /csrfToken\': { action: \'security/grant-csrf-token\' }');
              }

              if (_.keys(outdatedValidationsReport).length > 0) {
                report.push(figlet.textSync('validations', {font: 'Calvin S'}));
                report.push('The following model attributes contain validations that are no longer supported in Sails 1.0.\n' +
                            'It\'s recommended that you replace them with a `custom` (or if possible, `regex`) validation.\n' +
                            'See http://sailsjs.com/docs/concepts/models-and-orm/validations for the current list of\n'+
                            'supported validations and info on how to use `custom` and `regex`.\n');
                _.each(outdatedValidationsReport, function(attributes, model) {
                  report.push('* In model `' + model + '` (api/models/' + model + '.js):');
                  _.each(attributes, function(validations, attribute) {
                    report.push('   + `'  + attribute + '` attribute (' + validations.join(', ') + ')');
                  });

                });
              }

              if (addRemoveSaveCalls.length) {
                report.push(figlet.textSync('add, remove and save methods', {font: 'Calvin S'}));
                report.push('In Sails 1.0, records no longer support .add() and .remove() for adding and removing\n'+
                            'child records in a collection attribute.  Records also don\'t support the .save() method.\n'+
                            'Instead, use the model class methods\n'+
                            '`.update()`, `.addToCollection()`, `.removeFromCollection()` and `.replaceCollection()`.\n\n'+
                            'Found the following possible references to `.add()`, `.remove() and `.save()`:\n\n'+
                            _.map(addRemoveSaveCalls, function(reference) { return '* ' + reference; }).join('\n') + '\n\n' +
                            'See the reference docs for more info:\n'+
                            '.update(): https://sailsjs.com/docs/reference/waterline/models/update\n'+
                            '.addToCollection(): https://sailsjs.com/docs/reference/waterline/models/addToCollection\n'+
                            '.removeFromCollection(): https://sailsjs.com/docs/reference/waterline/models/removeFromCollection\n'+
                            '.replaceCollection(): https://sailsjs.com/docs/reference/waterline/models/replaceCollection'
                            );
              }

              if (report.length) {

                report.unshift(
                  figlet.textSync('Report', {font: 'ANSI Shadow'}) +
                  '\n'+
                  '==================================================\n\n'+
                  'This report highlights various issues that may need to be addressed before your app will work with Sails 1.0.\n' +
                  'After implementing these suggestions, some good next steps are:\n' +
                  '* Review the full migration guide at: https://github.com/balderdashy/sails-docs/blob/1.0/upgrading/To1.0.md\n' +
                  '* Attempt to lift and run your app with Sails 1.0.\n' +
                  '* See http://sailsjs.com/support for support options!\n'
                );

                // Save the report to disk.
                Filesystem.writeSync({
                  string: report.join('\n\n'),
                  destination: path.resolve(projectDir, 'sails_1.0_migration_report.txt'),
                  force: true
                }).execSync();


                // Output the report to the console.
                console.log(report.join('\n\n'));
                console.log();
                console.log('--------------------------------------------------------------------------------------------------------');
                console.log('Saved this migration report to ' + path.resolve(projectDir, 'sails_1.0_migration_report.txt') + '!');
                console.log('--------------------------------------------------------------------------------------------------------');
              }
              else {
                console.log('The scanner didn\'t have anything to report -- you\'re in good shape!');
              }
              console.log('\nThe migration utility has completed!\n');
              console.log('Next steps:');
              console.log('* Review the full migration guide at: https://github.com/balderdashy/sails-docs/blob/1.0/upgrading/To1.0.md');
              console.log('* Attempt to lift and run your app with Sails 1.0.');
              console.log('* See http://sailsjs.com/support for support options!\n');
              return done();
            });



          }

        });

      });

      //  ██████╗ ██╗   ██╗███╗   ██╗    ████████╗ █████╗ ███████╗██╗  ██╗███████╗
      //  ██╔══██╗██║   ██║████╗  ██║    ╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔════╝
      //  ██████╔╝██║   ██║██╔██╗ ██║       ██║   ███████║███████╗█████╔╝ ███████╗
      //  ██╔══██╗██║   ██║██║╚██╗██║       ██║   ██╔══██║╚════██║██╔═██╗ ╚════██║
      //  ██║  ██║╚██████╔╝██║ ╚████║       ██║   ██║  ██║███████║██║  ██╗███████║
      //  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝       ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝
      //
      async.series(tasks, done);

    },

    templatesDirectory: __dirname,

    targets: {}

  };

})();
