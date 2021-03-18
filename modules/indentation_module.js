﻿/*
* Copyright 2020 Matthew Simmons
* */
let indentation_module = {};

(function () {

    class Options {
        constructor(enabled = false) {
            this.enabled = enabled;
        }
    }

    this.getDefaultOptions = function () {
        return new Options();
    }

    const LastLineIndentationStatus = {
        PROPERLY_INDENTED: 0,
        OVERINDENTED: 1,
        UNDERINDENTED: 2
    }

    /**
     * Initialize the module: perform code analysis, add relevant controls to the uiPanel.
     * @param {HTMLDivElement} uiPanel
     * @param {Array.<HTMLTableRowElement>} trCodeLines
     * @param {Options} options
     */
    this.initialize = function (uiPanel, trCodeLines, options) {
        if (!options.enabled) {
            return;
        }

        $(uiPanel).append("<h3 style='color:#92b9d1'>Indentation</h3>");
        /*
        Criteria for correct indentation:
        1) Consistent style, first non white space character must line up with closing brace
        1a) If, the ugly style, opening must line up with closing brace

        Oops this is the indentation module not braces
        Check for indentation after opening brace
        */

        let stack = [0];

        let isPrev = false;
        let isComment = false;
        let isNotAllman = 0;
        let expectedIndent = 0;

        // find first indent used and use that as standard
        let i;
        let singleIndentWidth = 0;
        for (i = 0; i < trCodeLines.length;) {
            if (getCodeFromTrCodeLine(trCodeLines[i++]).includes('{')) {
                while (getCodeFromTrCodeLine(trCodeLines[i]).trim().length === 0) { // Makes sure next isn't an empty line
                    i++;
                }
                //assumes first line with indentation will have exactly one indent
                singleIndentWidth = getIndentationWidth(getCodeFromTrCodeLine(trCodeLines[i]));
                break;
            }
        }


        let lastLineStatus = LastLineIndentationStatus.PROPERLY_INDENTED;
        let currentIndentationWidth = 0; // in white spaces
        $.each(trCodeLines, function (tri, trCodeLine) {	// iterates each line of code below

            let codeText = stripStringsFromCode(getCodeFromTrCodeLine(trCodeLine));

            codeText = codeText.replace(/\t/, "    ");

            if(isComment && codeText.indexOf("*/") !== -1 && codeText.indexOf("/*") > codeText.indexOf("*/")) {
                isComment = false;
                codeText = codeText.replace(/^((?!\*\/).)*\*\//, " ".repeat(codeText.indexOf("*/") + 2));
            }
            while(codeText.indexOf("*/") !== -1) {
                codeText = codeText.replace(/\/\*.*?\*\//, " ".repeat(codeText.indexOf("*/") - codeText.indexOf("/*") + 2));
            }
            if(codeText.indexOf("/*") !== -1) {
                isComment = true;
            }

            if(isComment) return;

            // Skip blank lines
            if (codeText.search(/\S/) === -1) return;

            if (codeText.trim().charAt(0) === "@") return;

            if (codeText.trim().substr(0, 2) === "//") return;

            if(codeText.indexOf("//") !== -1) codeText = codeText.substr(0, codeText.indexOf("//"));

            // Handle opening and closing braces updating indent size
            if (codeText.trim().indexOf("}") === 0) {
                currentIndentationWidth -= singleIndentWidth;
            }

            if (isPrev && codeText.trim().charAt(0) === "{") { // Accounts for Allman braces
                isPrev = false;
                if (isNotAllman > 0) {
                    isNotAllman--;
                }
            }

            if (isNotAllman > 0) {
                isPrev = false;
                currentIndentationWidth += singleIndentWidth;
            }

            // verify current indent is correct
            if ((!isPrev && getIndentationWidth(codeText) !== currentIndentationWidth) || (isPrev && getIndentationWidth(codeText) < expectedIndent)) {
                let defaultMessage = "Detected indent: " + getIndentationWidth(codeText) + ", Expected indent: " + currentIndentationWidth;
                let newProblem = false;
                let shortProblemDescription = "";
                if (currentIndentationWidth < getIndentationWidth(codeText)) {
                    highlightSection(trCodeLine, currentIndentationWidth, "#92b9d1");
                    if (lastLineStatus !== LastLineIndentationStatus.OVERINDENTED) {
                        newProblem = true;
                        shortProblemDescription = "Over-indent";
                        $(uiPanel).append(makeLabelWithClickToScroll(shortProblemDescription, trCodeLine, "", defaultMessage));
                        lastLineStatus = LastLineIndentationStatus.OVERINDENTED;
                    }
                } else {
                    highlightSection(trCodeLine, 0, "#92b9d1");
                    if (lastLineStatus !== LastLineIndentationStatus.UNDERINDENTED) {
                        newProblem = true;
                        shortProblemDescription = "Under-indent";
                        $(uiPanel).append(makeLabelWithClickToScroll(shortProblemDescription, trCodeLine, "", defaultMessage));
                        lastLineStatus = LastLineIndentationStatus.UNDERINDENTED;
                    }
                }
                if (newProblem) {
                    addButtonComment(trCodeLine, shortProblemDescription, defaultMessage, "#92b9d1");
                }
            } else {
                lastLineStatus = LastLineIndentationStatus.PROPERLY_INDENTED;
            }

            if(isPrev) {
                expectedIndent = Math.max(expectedIndent, currentIndentationWidth);
            }

            // if opening brace exists, increase indent
            if (codeText.indexOf("{") !== -1) {
                if (codeText.trim().indexOf("}") === 0) {
                    currentIndentationWidth += (codeText.match(/{/g).length - codeText.match(/}/g).length + 1) * singleIndentWidth;
                } else if (codeText.indexOf("}") === -1) {
                    currentIndentationWidth += codeText.match(/{/g).length * singleIndentWidth;
                } else {
                    currentIndentationWidth += (codeText.match(/{/g).length - codeText.match(/}/g).length) * singleIndentWidth;
                }
                stack.push(isNotAllman);
                isNotAllman = 0;
            }

            if (codeText.indexOf("}") !== -1) {
                if (codeText.indexOf("{") === -1 && codeText.trim().indexOf("}") !== 0) {
                    currentIndentationWidth -= codeText.match(/}/g).length * singleIndentWidth;
                }
                isNotAllman = stack.pop(); // Somehow, this fixes nested if's with AND without braces
            }

            // If it doesn't end in a correct delimiter, it's a continuation of the previous line.
            if (!isPrev && codeText.search(/(for|while|do|else|if)\W/) !== -1
                && codeText.trim().charAt(codeText.trim().length - 1) !== "{" && codeText.trim().charAt(codeText.trim().length - 1) !== ";") {
                if (codeText.trim().charAt(codeText.trim().length - 1) !== ";" && (codeText.indexOf(")") === codeText.indexOf("(") || (codeText.indexOf(")") !== -1 && codeText.match(/\(/g).length === codeText.match(/\)/g).length))) {
                    if(codeText.indexOf("}") === -1 || codeText.indexOf("{") === -1 || codeText.match(/{/g).length !== codeText.match(/}/g).length) {
                        isPrev = true;
                        isNotAllman++;
                    }
                } else {
                    isPrev = true;
                    expectedIndent = currentIndentationWidth;
                }
            } else if (!isPrev && [";", "{", "}"].indexOf(codeText.trim().charAt(codeText.trim().length - 1)) === -1) {
                if (codeText.trim().search(/^(private|public|protected)/) === -1 || // False negative - package private Allman
                    codeText.trim().charAt(codeText.trim().length - 1) !== ")") { // False positive - multiline fields ending in )

                    isPrev = true;
                    stack.push(isNotAllman);
                    isNotAllman = 0;
                    expectedIndent = currentIndentationWidth;

                }
            } else if (isPrev && [";", "{", "}"].indexOf(codeText.trim().charAt(codeText.trim().length - 1)) !== -1) {
                if (isNotAllman === 0) { //Aman Sheth's P2 has REALLY GOOD edge cases for this stuff...
                    isPrev = false;

                }
                isNotAllman = stack.pop();
                if (isNotAllman > 0) {
                    currentIndentationWidth -= isNotAllman * singleIndentWidth;
                    isNotAllman = 0;
                }
            } else if (isNotAllman > 0) {
                currentIndentationWidth -= isNotAllman * singleIndentWidth;
                isNotAllman = 0;
            }
        });
    }

}).apply(indentation_module);