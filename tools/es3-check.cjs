/* Maintainer/cloud tooling. Never load this file in After Effects. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {TextDecoder} = require('util');
let acorn;
try { acorn = require('acorn'); }
catch (externalUnavailable) {
    try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); }
    catch (internalUnavailable) { throw new Error('Acorn is required. Install acorn 8.17.0 or use the provided cloud check runner.'); }
}
const OPTIONS = Object.freeze({ecmaVersion: 3, allowReserved: 'never',
    sourceType: 'script', locations: true, allowHashBang: false});
// ECMA-262 edition 3, 7.5.2/7.5.3. Also verify the parsed identifiers:
// Acorn 8.17.0 omits `const` from its ES3 reserved list and accepts debugger.
// Keep the upstream bundle unchanged and make the conservative policy explicit.
const RESERVED = new Set(('break else new var case finally return void catch for switch while ' +
    'continue function this with default if throw delete in try do instanceof typeof ' +
    'null true false abstract enum int short boolean export interface static byte extends long super ' +
    'char final native synchronized class float package throws const goto private transient ' +
    'debugger implements protected volatile double import public').split(' '));
function checkIdentifiers(tree) {
    const pending = [tree];
    while (pending.length) {
        const node = pending.pop();
        if (!node || typeof node !== 'object') continue;
        if ((node.type === 'Identifier' && RESERVED.has(node.name)) || node.type === 'DebuggerStatement') {
            const error = new SyntaxError('Reserved word in ES3 profile: ' + (node.name || 'debugger'));
            error.pos = node.start;
            error.loc = node.loc.start;
            throw error;
        }
        for (const key of Object.keys(node)) {
            if (key === 'loc') continue;
            const value = node[key];
            if (Array.isArray(value)) pending.push(...value);
            else if (value && typeof value === 'object' && value.type) pending.push(value);
        }
    }
}

function analyze(source, filename = '<source>') {
    const report = {file: filename, sha256: crypto.createHash('sha256').update(source).digest('hex'),
        parser: 'Acorn ' + acorn.version, options: {...OPTIONS},
        reservedIdentifierPolicy: 'ECMA-262 edition 3 keywords/future reserved words; v1',
        profile: 'conservative ES3 syntax; not ExtendScript or AE runtime verification',
        status: 'fail', directives: []};
    let code = source;
    for (;;) {
        try {
            checkIdentifiers(acorn.parse(code, OPTIONS));
            report.status = 'pass';
            return report;
        } catch (error) {
            // Mask only a recognized, complete directive at the parser's error
            // position. Strings/comments are never searched/replaced globally.
            const pos = error.pos;
            if (Number.isInteger(pos) && code[pos] === '#') {
                let start = pos;
                let end = pos;
                while (start > 0 && !/[\r\n\u2028\u2029]/.test(code[start - 1])) start--;
                while (end < code.length && !/[\r\n\u2028\u2029]/.test(code[end])) end++;
                const line = code.slice(start, end);
                const match = line.match(/^[\t \uFEFF]*#(target|targetengine)[\t ]+(?:"[^"\r\n]*"|'[^'\r\n]*'|[A-Za-z_$][\w$.-]*)[\t ]*(?:\/\/[^\r\n]*)?$/);
                if (match) {
                    report.directives.push({line: error.loc.line, name: match[1]});
                    code = code.slice(0, start) + ' '.repeat(end - start) + code.slice(end);
                    continue;
                }
                if (/^[\t \uFEFF]*#/.test(line)) {
                    report.status = 'blocked';
                    report.error = {line: error.loc.line, column: error.loc.column + 1,
                        message: 'Unsupported or malformed directive. Resolve includes/preprocessing explicitly; no syntax pass.'};
                    return report;
                }
            }
            report.error = {line: error.loc ? error.loc.line : null,
                column: error.loc ? error.loc.column + 1 : null, message: error.message};
            return report;
        }
    }
}

function analyzeFile(filename) {
    let bytes;
    try {
        bytes = fs.readFileSync(filename);
        // Fatal decoding prevents silently checking replacement characters.
        const source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
        const report = analyze(source, filename);
        report.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        return report;
    } catch (error) {
        return {file: filename, status: 'blocked',
            sha256: bytes ? crypto.createHash('sha256').update(bytes).digest('hex') : null,
            error: {message: error.message}};
    }
}

function collectHostFiles(input) {
    const stat = fs.statSync(input);
    if (!stat.isDirectory()) return [input];
    const found = [];
    for (const entry of fs.readdirSync(input, {withFileTypes: true})) {
        const file = path.join(input, entry.name);
        if (entry.isDirectory()) found.push(...collectHostFiles(file));
        else if (entry.isFile() && /\.(jsx|jsxinc)$/i.test(entry.name)) found.push(file);
    }
    return found.sort();
}

module.exports = {OPTIONS, analyze, analyzeFile, collectHostFiles};
if (require.main === module) {
    const reports = [];
    for (const input of process.argv.slice(2)) {
        try {
            const files = collectHostFiles(input);
            if (!files.length) reports.push({file: input, status: 'blocked', error: {message: 'No JSX/JSXINC host sources found'}});
            reports.push(...files.map(analyzeFile));
        } catch (error) {
            reports.push({file: input, status: 'blocked', error: {message: error.message}});
        }
    }
    if (!reports.length) reports.push({status: 'blocked', error: {message: 'Usage: node tools/es3-check.cjs FILE_OR_HOST_DIRECTORY [...]'}});
    process.stdout.write(JSON.stringify({reports, hostTests: 'not_run'}, null, 2) + '\n');
    process.exitCode = reports.every(report => report.status === 'pass') ? 0 : 1;
}
