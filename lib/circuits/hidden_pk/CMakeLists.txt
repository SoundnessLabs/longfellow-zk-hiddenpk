proofs_add_test(hidden_pk_test)
target_link_libraries(hidden_pk_test ec sha3 util crypto)

# Standalone proving CLI for the hidden PK circuit.
add_executable(hidden_pk_prove hidden_pk_prove.cc)
target_link_libraries(hidden_pk_prove ec sha3 util crypto algebra)
