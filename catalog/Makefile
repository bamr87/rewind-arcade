PY ?= python3

.PHONY: test build check

test:            ## run the test suite (stdlib unittest, no dependencies)
	PYTHONPATH=src $(PY) -m unittest discover -s tests -t . -v

build:           ## scan file refs, enrich and export the catalog
	./bin/cartidx build

check: test      ## tests plus a byte-compile of every module
	$(PY) -m compileall -q src tests
