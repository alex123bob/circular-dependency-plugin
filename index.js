let path = require('path')
let extend = require('util')._extend
let BASE_ERROR = 'Circular dependency detected:\r\n'
let PluginTitle = 'CircularDependencyPlugin'
const fs = require('fs')

class CircularDependencyPlugin {
  constructor(options) {
    this.options = extend({
      exclude: new RegExp('$^'),
      include: new RegExp('.*'),
      failOnError: false,
      allowAsyncCycles: false,
      onDetected: false,
      cwd: process.cwd(),
    }, options)

    this.cycles = []
  }

  apply(compiler) {
    let plugin = this
    let cwd = this.options.cwd

    compiler.hooks.compilation.tap(PluginTitle, (compilation) => {
      compilation.hooks.optimizeModules.tap(PluginTitle, (modules) => {
        plugin.cycles = []
        if (plugin.options.onStart) {
          plugin.options.onStart({ compilation })
        }
        for (let module of modules) {
          const shouldSkip = (
            module.resource == null ||
            plugin.options.exclude.test(module.resource) ||
            !plugin.options.include.test(module.resource)
          )
          // skip the module if it matches the exclude pattern
          if (shouldSkip) {
            continue
          }

          let maybeCyclicalPathsList = this.isCyclic(module, module, {}, compilation)
          if (maybeCyclicalPathsList) {
            // allow consumers to override all behavior with onDetected
            if (plugin.options.onDetected) {
              try {
                plugin.options.onDetected({
                  module: module,
                  paths: maybeCyclicalPathsList,
                  compilation: compilation
                })
              } catch (err) {
                compilation.errors.push(err)
              }
              maybeCyclicalPathsList.forEach((path, index, arr) => {
                if (arr[index + 1]) {
                  plugin.cycles.push([path, arr[index + 1], 'depend'].join(',') + '\n')
                }
              })
              continue
            }

            // mark warnings or errors on webpack compilation
            let error = new Error(BASE_ERROR.concat(maybeCyclicalPathsList.join(' -> ')))
            if (plugin.options.failOnError) {
              compilation.errors.push(error)
            } else {
              compilation.warnings.push(error)
            }
          }
        }
        if (plugin.options.onEnd) {
          plugin.options.onEnd({ compilation })
        }
      })
    })

    compiler.hooks.done.tapAsync(PluginTitle, (stat, callback) => {
      setImmediate(async () => {
        try {
          if (plugin.cycles.length > 0) {
            plugin.cycles.unshift('source,target,type\n')
            const graphFolder = 'analysisgraph/'
            fs.writeFile(path.join(__dirname, graphFolder + 'files', 'analysis.csv'), plugin.cycles.join(''), (err) => {
              if (!err) {
                const folderName = 'circularanalysis'
                if (!fs.existsSync(path.join(cwd, folderName))) {
                  fs.mkdirSync(path.join(cwd, folderName))
                  fs.mkdirSync(path.join(cwd, folderName, 'files'))
                }
                fs.copyFileSync(path.join(__dirname, graphFolder + 'helper.js'), path.join(cwd, folderName, 'helper.js'))
                fs.copyFileSync(path.join(__dirname, graphFolder + 'index.html'), path.join(cwd, folderName, 'index.html'))
                fs.copyFileSync(path.join(__dirname, graphFolder + 'index.js'), path.join(cwd, folderName, 'index.js'))
                fs.copyFileSync(path.join(__dirname, graphFolder + 'inspector.css'), path.join(cwd, folderName, 'inspector.css'))
                fs.copyFileSync(path.join(__dirname, graphFolder + 'main.js'), path.join(cwd, folderName, 'main.js'))
                fs.copyFileSync(path.join(__dirname, graphFolder + 'runtime.js'), path.join(cwd, folderName, 'runtime.js'))
                fs.copyFileSync(path.join(__dirname, graphFolder + 'start.cjs'), path.join(cwd, folderName, 'start.cjs'))
                fs.copyFileSync(path.join(__dirname, graphFolder + 'files/analysis.csv'), path.join(cwd, folderName, 'files', 'analysis.csv'))
              }
            })
          }
          callback()
        }
        catch (e) {
          callback(e)
        }
      })
    })
  }

  isCyclic(initialModule, currentModule, seenModules, compilation) {
    let cwd = this.options.cwd

    // Add the current module to the seen modules cache
    seenModules[currentModule.debugId] = true

    // If the modules aren't associated to resources
    // it's not possible to display how they are cyclical
    if (!currentModule.resource || !initialModule.resource) {
      return false
    }

    // Iterate over the current modules dependencies
    for (let dependency of currentModule.dependencies) {
      if (
        dependency.constructor &&
        dependency.constructor.name === 'CommonJsSelfReferenceDependency'
      ) {
        continue
      }

      let depModule = null
      if (compilation.moduleGraph) {
        // handle getting a module for webpack 5
        depModule = compilation.moduleGraph.getModule(dependency)
      } else {
        // handle getting a module for webpack 4
        depModule = dependency.module
      }

      if (!depModule) { continue }
      // ignore dependencies that don't have an associated resource
      if (!depModule.resource) { continue }
      // ignore dependencies that are resolved asynchronously
      if (this.options.allowAsyncCycles && dependency.weak) { continue }
      // the dependency was resolved to the current module due to how webpack internals
      // setup dependencies like CommonJsSelfReferenceDependency and ModuleDecoratorDependency
      if (currentModule === depModule) {
        continue
      }

      if (depModule.debugId in seenModules) {
        if (depModule.debugId === initialModule.debugId) {
          // Initial module has a circular dependency
          return [
            path.relative(cwd, currentModule.resource),
            path.relative(cwd, depModule.resource)
          ]
        }
        // Found a cycle, but not for this module
        continue
      }

      let maybeCyclicalPathsList = this.isCyclic(initialModule, depModule, seenModules, compilation)
      if (maybeCyclicalPathsList) {
        maybeCyclicalPathsList.unshift(path.relative(cwd, currentModule.resource))
        return maybeCyclicalPathsList
      }
    }

    return false
  }
}

module.exports = CircularDependencyPlugin
