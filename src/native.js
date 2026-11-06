// Native boundary: the host provides source and consumes structured progress.
var $builtinmodule = function () {
    return {
        files: new Sk.builtin.func(function () {
            const entries = Object.entries(Sk.pytest.files).flatMap(([path, source]) =>
                [new Sk.builtin.str(path), new Sk.builtin.str(source)]);
            return new Sk.builtin.dict(entries);
        }),
        targets: new Sk.builtin.func(function () {
            return new Sk.builtin.list((Sk.pytest.targets || []).map(path => new Sk.builtin.str(path)));
        }),
        emit: new Sk.builtin.func(function (event) {
            Sk.pytest.emit(Sk.ffi.remapToJs(event));
            return Sk.builtin.none.none$;
        }),
    };
};
