let method_call_module = {};

(function () {

    class Options {
        /**
         * Make options for this module.
         * @param {boolean} enabled whether the module is enabled.
         * @param ignoredMethods (dictionary of lists of) methods whose calls to ignore.
         * The dictionary is keyed by class names inside whose implementations to ignore said calls,
         * globally-ignored methods should be under the key 'global'.
         * Use '$ClassName$.someInstanceMethod' for instance method 'someInstanceMethod' of class 'ClassName'.
         * Use 'ClassName.someStaticMethod' for static method 'someStaticMethod' of class 'ClassName'.
         * @param {boolean} showUniqueOnly whether to show only unique method call occurrences.
         */
        constructor(enabled = false,
                    ignoredMethods = {"global": []},
                    showUniqueOnly = false) {
            this.enabled = enabled;
            this.ignoredMethods = ignoredMethods;
            this.showUniqueOnly = showUniqueOnly;
        }
    }

    this.getDefaultOptions = function () {
        return new Options();
    }

    /**
     * Initialize the module: analyze the parsed code as necessary, add relevant controls to the UI panel.
     * @param {HTMLDivElement} uiPanel the UI panel where to add the controls.
     * @param {Map.<string,CodeFile>} fileDictionary dictionary of CodeFile objects to analyze for calls.
     * @param {Options} options options for the module.
     */
    this.initialize = function (uiPanel, fileDictionary, options) {
        if (!options.enabled) {
            return;
        }
        $(uiPanel).append("<h3 style='color:#b3769f'>Method Calls</h3>");
        const globallyIgnoredMethods = options.ignoredMethods.global;

        let methodCalls = [];

        for (const codeFile of fileDictionary.values()) {
            if (codeFile.abstractSyntaxTree !== null) {

                //iterate over classes / enums / etc.
                for (const [typeName, typeInformation] of codeFile.types) {
                    let ignoredMethodsForType = [...globallyIgnoredMethods];
                    if (options.ignoredMethods.hasOwnProperty(typeName)) {
                        ignoredMethodsForType.push(...options.ignoredMethods[typeName]);
                    }
                    ignoredMethodsForType = new Set(ignoredMethodsForType);
                    let methodCallsForType = [...typeInformation.methodCalls];
                    methodCallsForType = methodCallsForType.filter((methodCall) => {
                        return !ignoredMethodsForType.has(methodCall.name);
                    })
                    // special "this." case handling
                    if (ignoredMethodsForType.has("this.")) {
                        methodCallsForType = methodCallsForType.filter((methodCall) => {
                            return !methodCall.name.startsWith("this.");
                        })
                    }
                    methodCallsForType.forEach((methodCall) => {
                        if (methodCall.astNode.hasOwnProperty("name") &&
                            ignoredMethodsForType.has(methodCall.astNode.name.identifier)) {
                            methodCall.possiblyIgnored = true;
                        }
                    })
                    methodCalls.push(...methodCallsForType);
                }
            }
        }

        if (options.showUniqueOnly) {
            methodCalls = uniqueNames(methodCalls);
        }

        for (const methodCall of methodCalls) {
            if (methodCall.possiblyIgnored) {
                $(uiPanel).append(makeLabelWithClickToScroll(methodCall.name, methodCall.trCodeLine, "possibly-ignored-method-call"));
            } else {
                $(uiPanel).append(makeLabelWithClickToScroll(methodCall.name, methodCall.trCodeLine));
            }

            addButtonComment(
                methodCall.trCodeLine, capitalize(methodCall.callType) + " call: " + methodCall.name, "", "#b3769f"
            );
        }
    }

}).apply(method_call_module);