# Architecture fitness tests

`dependency-rules.test.ts` statically checks public package exports, forbidden core imports,
adapter direction, deep-import prevention, the acyclic package graph, and foundation science
isolation. The F1 run also executes a temporary forbidden-import negative control against this gate.
