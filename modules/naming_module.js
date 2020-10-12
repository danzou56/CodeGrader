let namingModule = {};

(function () {

    class Options {
        /**
         * Make options for this module.
         * @param {boolean} enabled
         * @param {Array.<string>} allowedSpecialWords
         * @param ignoredNames (dictionary of lists of) code names to ignore.
         * The dictionary is keyed by class names inside whose implementations to ignore said names,
         * globally-ignored names should be under the key 'global'.
         * @param {boolean} showUniqueOnly whether to show only unique code name occurrences.
         */
        constructor(enabled = false,
                    allowedSpecialWords = ["min", "max"],
                    ignoredNames = {"global": []},
                    showUniqueOnly = true) {
            this.enabled = enabled;
            this.allowedSpecialWords = allowedSpecialWords;
            this.ignoredNames = ignoredNames;
            this.showUniqueOnly = showUniqueOnly;
        }
    }

    this.getDefaultOptions = function () {
        return new Options();
    }

    const NameType = {
        METHOD: 'method',
        VARIABLE: 'variable',
        TYPE: 'type',
        CONSTANT: 'constant',
    }

    const NameTypeConvention = {
        'method': 'camelCase',
        'variable': 'camelCase',
        'type': 'PascalCase',
        'constant': 'ALL_CAPS_SNAKE_CASE',
    }


    /**
     * Check if the given name follows proper camelCase convention.
     * @param {string} name some string
     * @return {boolean} return true if name is in camelCase, false otherwise.
     */
    function isCamelCase(name) {
        return /^[a-z]+(?:(?:A)|(?:[A-Z][a-z]+))*[A-Z]?$/.test(name);
    }

    /**
     * Check if the given name follows proper PascalCase convention.
     * @param {string} name some string
     * @return {boolean} return true if name is in PascalCase, false otherwise.
     */
    function isPascalCase(name) {
        return /^(?:(?:A)|(?:[A-Z][a-z]+))*[A-Z]?$/.test(name);
    }

    /**
     * Check if the given name follows proper ALL_CAPS_SNAKE_CASE convention.
     * @param {string} name some string
     * @return {boolean} return true if name is in ALL_CAPS_SNAKE_CASE, false otherwise.
     */
    function isAllCapsSnakeCase(name) {
        return /^[A-Z]+(?:_[A-Z]+)*$/.test(name);
    }

    const NameTypeConventionCheck = {
        'method': isCamelCase,
        'variable': isCamelCase,
        'type': isPascalCase,
        'constant': isAllCapsSnakeCase,
    }

    /**
     * Represents an occurrence of a name within some chunk of Java code.
     * These include (but are not limited to): member/local/parameter variable names, class names, enum names, and method names.
     */
    class CodeName {
        constructor(name, trCodeLine, type, astNode) {
            this.name = name;
            this.trCodeLine = trCodeLine;
            this.type = type;
            this.astNode = astNode;
        }
    }

    /**
     * Splits a name into "words" (or attempts to).
     * Assumes camelCase, PascalCase, or ALL_CAPS_SNAKE_CASE.
     * @param {CodeName} codeName some string
     * @return {*|string[]}
     */
    function splitCodeNameIntoWords(codeName) {
        if (codeName.type === NameType.CONSTANT) {
            return codeName.name.split('_').map(word => word.toLowerCase());
        } else {
            return codeName.name.split(/(?=[A-Z])/).map(word => word.toLowerCase());
        }
    }


    const NameCheckProblemType = {
        NAMING_CONVENTION: 1,
        NON_DICTIONARY_WORD: 2
    }

    const NameCheckProblemTypeExplanation = {
        1: "Naming convention problem detected.",
        2: "Non-descriptive variable name detected: the name includes a non-dictionary word, abbreviation, or uncommon acronym."
    }

    const NameCheckProblemStyleClass = {
        1: "naming-convention-problem",
        2: "naming-non-dictionary-word-problem"
    }

    /**
     * Represents a potential problem detected with a name in Java code.
     */
    class NameCheckProblem {
        /**
         * @param {number} type
         * @param {string} description
         */
        constructor(type, description) {
            this.type = type;
            this.description = description;
        }
    }

    /**
     * Checks a code name occurrence for potential problems.
     * @param {CodeName} codeName
     * @return {Array.<NameCheckProblem>}
     */
    function checkName(codeName) {
        let potentialProblems = []
        if (!NameTypeConventionCheck[codeName.type](codeName.name)) {
            potentialProblems.push(new NameCheckProblem(NameCheckProblemType.NAMING_CONVENTION,
                NameCheckProblemTypeExplanation[NameCheckProblemType.NAMING_CONVENTION] + " "
                + capitalize(codeName.type) + " \"" + codeName.name + "\" doesn&#39;t seem to follow the "
                + NameTypeConvention[codeName.type] + " convention."));
        } else {
            // Note that currently, we cannot detect non-dictionary problem if the variable does not use proper notation,
            // because the splitting relies on the notation.
            let words = splitCodeNameIntoWords(codeName);
            let nonDictionaryWords = [];
            for (const word of words) {
                if (!usEnglishWordList.has(word)) {
                    nonDictionaryWords.push(word);
                }
            }
            if (nonDictionaryWords.length > 0) {
                if (nonDictionaryWords.length > 1) {
                    potentialProblems.push(new NameCheckProblem(NameCheckProblemType.NON_DICTIONARY_WORD,
                        NameCheckProblemTypeExplanation[NameCheckProblemType.NON_DICTIONARY_WORD] +
                        " " + capitalize(codeName.type) + " \"" + codeName.name + "\" has parts \""
                        + nonDictionaryWords.join("\", \"") + "\" that appear problematic."));
                } else {
                    potentialProblems.push(new NameCheckProblem(NameCheckProblemType.NON_DICTIONARY_WORD,
                        NameCheckProblemTypeExplanation[NameCheckProblemType.NON_DICTIONARY_WORD] +
                        " " + capitalize(codeName.type) + " \"" + codeName.name + "\" has part \""
                        + nonDictionaryWords[0] + "\" that appears problematic."));
                }
            }
        }
        return potentialProblems;
    }


    /**
     * Parses provided declaration as a constant, method, or variable name and stores the generated CodeName object
     * in the corresponding array.
     * @param {Object} declaration AST of a declaration
     * @param {Array.<CodeName>} constantNames array with constant names
     * @param {Array.<CodeName>} methodAndVariableNames array with method and/or variable names
     * @param {CodeFile} codeFile code file descriptor (used to associate the result with an html element)
     */
    function handleFieldOrVariableDeclaration(declaration, constantNames, methodAndVariableNames, codeFile) {
        let is_constant = false;
        const trCodeLine = codeFile.trCodeLines[declaration.location.start.line - 1];
        for (const modifier of declaration.modifiers) {
            if (modifier.keyword === "final") {
                is_constant = true;
            }
        }
        for (const fragment of declaration.fragments) {
            const name = fragment.name.identifier;
            if (is_constant) {
                constantNames.push(new CodeName(name, trCodeLine, NameType.CONSTANT, fragment));
            } else {
                methodAndVariableNames.push(new CodeName(name, trCodeLine, NameType.VARIABLE, fragment));
            }
        }
    }

    /**
     * Parses names of variables / constants from a set of AST statements
     * @param {Array.<Object>} statements array of AST statement nodes
     * @param {Array.<CodeName>} constantNames any constants that are found are stored as CodeName objects here
     * @param {Array.<CodeName>} methodAndVariableNames any variables that are found are stored as CodeName objects here
     * @param {CodeFile} codeFile the code file descriptor with the AST from which the statements came
     */
    function handleBlockOfStatements(statements, constantNames, methodAndVariableNames, codeFile) {
        for (const statement of statements) {
            if (statement.node === "VariableDeclarationStatement" || statement.node === "VariableDeclarationExpression") {
                handleFieldOrVariableDeclaration(statement, constantNames, methodAndVariableNames, codeFile);
            } else if (statement.node === "ForStatement") {
                handleBlockOfStatements(statement.initializers, constantNames, methodAndVariableNames, codeFile);
                if (statement.body.node === "ExpressionStatement") {
                    handleBlockOfStatements([statement.body.expression], constantNames, methodAndVariableNames, codeFile);
                } else if(statement.body.node === "Block") {
                    handleBlockOfStatements(statement.body.statements, constantNames, methodAndVariableNames, codeFile);
                } else {
                    console.log("Unhandled for statement type!");
                    console.log(statement);
                }
            } else if (statement.node === "EnhancedForStatement") {
                methodAndVariableNames.push(new CodeName(statement.parameter.name.identifier,
                    codeFile.trCodeLines[statement.parameter.location.start.line - 1], NameType.VARIABLE, statement.parameter));
            }
        }
    }

    /**
     * Get all code names for the provided AST of some Java type.
     * @param {Object} type the AST
     * @param {CodeFile} codeFile a code file descriptor with the AST containing html tr tags for code lines.
     * @returns {Array.<Array.<CodeName>>}
     */
    function getTypeNames(type, codeFile) {
        let methodAndVariableNames = [];
        let constantNames = [];
        let typeNames = [];

        const name = type.name.identifier;
        typeNames.push(new CodeName(name, codeFile.trCodeLines[type.location.start.line - 1], NameType.TYPE, type));

        for (const declaration of type.bodyDeclarations) {
            switch (declaration.node) {
                case "FieldDeclaration":
                    handleFieldOrVariableDeclaration(declaration, constantNames, methodAndVariableNames, codeFile);
                    break;
                case "MethodDeclaration":
                    if (!declaration.constructor) {
                        const name = declaration.name.identifier;
                        methodAndVariableNames.push(new CodeName(name, codeFile.trCodeLines[declaration.location.start.line - 1], NameType.METHOD, declaration));

                        for (const parameter of declaration.parameters) {
                            const name = parameter.name.identifier;
                            methodAndVariableNames.push(new CodeName(name, codeFile.trCodeLines[declaration.location.start.line - 1], NameType.VARIABLE));
                        }
                        if (declaration.body != null) {
                            handleBlockOfStatements(declaration.body.statements, constantNames, methodAndVariableNames, codeFile);
                        }
                    }
                    break;
                case "TypeDeclaration": // inner class
                    const [innerTypeMethodsAndVariables, innerTypeConstants, innerTypeTypeNames] = getTypeNames(declaration, codeFile);
                    methodAndVariableNames.push(...innerTypeMethodsAndVariables);
                    constantNames.push(...innerTypeConstants);
                    typeNames.push(...innerTypeTypeNames);
                    break;
                default:
                    break;
            }
        }
        return [methodAndVariableNames, constantNames, typeNames];
    }

    /**
     * Process an array of code name objects: add a UI button for each code name,
     * as well as an in-code label with a hidden text area.
     * @param uiPanel
     * @param {Array.<CodeName>} codeNames
     * @param {string} color
     * @param {string} sectionTitle
     */
    function processCodeNameArrayAndAddSection(uiPanel, codeNames, color, sectionTitle) {
        $(uiPanel).append("<h4 style='color:" + color + "'>" + sectionTitle + "</h4>");
        for (const codeName of codeNames) {
            let potentialProblems = checkName(codeName);
            let problemsDescription = null;
            let labelStyleClass = "";
            let defaultMessageText = "";

            if (potentialProblems.length > 0) {
                problemsDescription = potentialProblems.map(problem => problem.description).join(" ");
                if (potentialProblems.length > 1) {
                    labelStyleClass = "naming-compound-problem";
                } else {
                    labelStyleClass = NameCheckProblemStyleClass[potentialProblems[0].type];
                }
                defaultMessageText = problemsDescription;
            } else {
                problemsDescription = "No problems were automatically detected.";
            }
            $(uiPanel).append(makeLabelWithClickToScroll(codeName.name, codeName.trCodeLine, labelStyleClass, problemsDescription));
            addButtonComment(
                codeName.trCodeLine, capitalize(codeName.type) + " name: " + codeName.name,
                defaultMessageText, color
            );
        }
    }

    /**
     * Initialize the module: perform code analysis, add relevant controls to the uiPanel.
     * @param {HTMLDivElement} uiPanel
     * @param {Map.<string, CodeFile>} fileDictionary
     * @param {Options} options
     */
    this.initialize = function (uiPanel, fileDictionary, options) {
        if (!options.enabled) {
            return;
        }
        $(uiPanel).append("<h3 style='color:#ffa500'>Naming</h3>");

        let methodAndVariableNames = [];
        let constantNames = [];
        let typeNames = [];

        let globalIgnoredNames = options.ignoredNames.global;

        for (const [filename, codeFile] of fileDictionary.entries()) {

            if (codeFile.abstractSyntaxTree !== null) {
                const syntaxTree = codeFile.abstractSyntaxTree;

                //iterate over classes / enums / etc.
                for (const type of syntaxTree.types) {
                    let ignoredNamesForType = [...globalIgnoredNames];
                    if (options.ignoredNames.hasOwnProperty(type.name.identifier)) {
                        ignoredNamesForType.push(...options.ignoredNames[type.name.identifier]);
                    }
                    ignoredNamesForType = new Set(ignoredNamesForType);

                    const [typeMethodsAndVariables, typeConstants, typeTypeNames] = getTypeNames(type, codeFile);

                    methodAndVariableNames.push(...typeMethodsAndVariables.filter(codeName => !ignoredNamesForType.has(codeName.name)));
                    constantNames.push(...typeConstants.filter(codeName => !ignoredNamesForType.has(codeName.name)));
                    typeNames.push(...typeTypeNames.filter(codeName => !ignoredNamesForType.has(codeName.name)));
                }
            }
        }

        if (options.showUniqueOnly) {
            methodAndVariableNames = uniqueNames(methodAndVariableNames);
            constantNames = uniqueNames(constantNames);
            typeNames = uniqueNames(typeNames);
        }

        processCodeNameArrayAndAddSection(uiPanel, methodAndVariableNames, "#4fa16b", "Variables &amp; Methods");
        processCodeNameArrayAndAddSection(uiPanel, constantNames, "#4f72e3", "Constants");
        processCodeNameArrayAndAddSection(uiPanel, typeNames, "orange", "Classes &amp; Enums");

    }

}).apply(namingModule);