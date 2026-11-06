"""Function-scoped Python stream capture; the host still owns browser output."""
import sys
from collections import namedtuple
from contextlib import contextmanager


CaptureResult = namedtuple('CaptureResult', ('out', 'err'))


class _CaptureStream:
    def __init__(self):
        self.parts = []

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError('write() argument must be str')
        self.parts.append(text)
        return len(text)

    def flush(self):
        pass

    def isatty(self):
        return False

    def take(self):
        text = ''.join(self.parts)
        self.parts.clear()
        return text


class CaptureFixture:
    def __init__(self, parent=None):
        self.original = (sys.stdout, sys.stderr)
        self.streams = (_CaptureStream(), _CaptureStream())
        self.parent = parent
        self._disabled = False
        sys.stdout, sys.stderr = self.streams

    def readouterr(self):
        return CaptureResult(*(stream.take() for stream in self.streams))

    @contextmanager
    def disabled(self):
        if self._disabled:
            yield
            return
        self._disabled = True
        sys.stdout, sys.stderr = self.original
        try:
            if self.parent is None:
                yield
            else:
                # capsys.disabled() also bypasses the test's automatic capture.
                with self.parent.disabled():
                    yield
        finally:
            sys.stdout, sys.stderr = self.streams
            self._disabled = False

    def _stop(self):
        sys.stdout, sys.stderr = self.original
        return self.readouterr()

    def _close(self):
        # Fixture output not consumed by readouterr joins the outer test report.
        captured = self._stop()
        for original, text in zip(self.original, captured):
            if text:
                original.write(text)
                flush = getattr(original, 'flush', None)
                if flush is not None:
                    flush()


def _capsys(request):
    capture = CaptureFixture(request._context.capture)
    request.addfinalizer(capture._close)
    return capture
