// Native boundary: the host provides source and consumes structured progress.
var $builtinmodule = function () {
    const mod = {};
    Sk.abstr.setUpModuleMethods("_skulpt_pytest", mod, {
        files: {
            $meth() {
                const entries = Object.entries(Sk.pytest.files).flatMap(([path, source]) =>
                    [new Sk.builtin.str(path), new Sk.builtin.str(source)]);
                return new Sk.builtin.dict(entries);
            },
            $flags: { NoArgs: true },
            $textsig: "($module, /)",
        },
        targets: {
            $meth() {
                return new Sk.builtin.list((Sk.pytest.targets || []).map(path => new Sk.builtin.str(path)));
            },
            $flags: { NoArgs: true },
            $textsig: "($module, /)",
        },
        keyword_expression: {
            $meth() {
                const expression = Sk.pytest.keywordExpression;
                return expression == null ? Sk.builtin.none.none$ : new Sk.builtin.str(expression);
            },
            $flags: { NoArgs: true },
            $textsig: "($module, /)",
        },
        collect_only: {
            $meth() {
                return Sk.pytest.collectOnly ? Sk.builtin.bool.true$ : Sk.builtin.bool.false$;
            },
            $flags: { NoArgs: true },
            $textsig: "($module, /)",
        },
        emit: {
            $meth(event) {
                Sk.pytest.emit(Sk.ffi.remapToJs(event));
                return Sk.builtin.none.none$;
            },
            $flags: { OneArg: true },
            $textsig: "($module, event, /)",
        },
    });
    return mod;
};
