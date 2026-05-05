// Proving CLI for the HiddenPK circuit.
//
// Usage:
//   hidden_pk_prove --pkX 0x<64hex> --pkY 0x<64hex> \
//                   --r 0x<64hex>   --s 0x<64hex>   \
//                   --msg 0x<64hex>                  \
//                   [--rate N] [--nreq N] [--version N]
//
// --rate     Reed-Solomon rate (default: 7)
// --nreq     number of Ligero queries (default: 132)
// --version  transcript version (default: 7)
//
// it outputs a single JSON line

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "algebra/crt.h"
#include "algebra/crt_convolution.h"
#include "algebra/reed_solomon.h"
#include "arrays/dense.h"
#include "circuits/compiler/compiler.h"
#include "circuits/hidden_pk/hidden_pk_circuit.h"
#include "circuits/hidden_pk/hidden_pk_witness.h"
#include "circuits/logic/compiler_backend.h"
#include "circuits/logic/logic.h"
#include "ec/p256k1.h"
#include "random/secure_random_engine.h"
#include "random/transcript.h"
#include "sumcheck/circuit.h"
#include "util/log.h"
#include "util/readbuffer.h"
#include "zk/zk_proof.h"
#include "zk/zk_prover.h"
#include "zk/zk_verifier.h"

namespace proofs {
namespace {

using Field = Fp256k1Base;
using EC    = P256k1;
using Nat   = Fp256k1Nat;
using Elt   = Field::Elt;

// Transcript label shared between the prove and verify sides of this binary.
static constexpr uint8_t kLabel[]  = "hidden_pk_prove";
static constexpr size_t  kLabelLen = sizeof(kLabel) - 1;

std::unique_ptr<Circuit<Field>> make_circuit() {
  using CompilerBackend = CompilerBackend<Field>;
  using LogicType       = Logic<Field, CompilerBackend>;
  using CircuitType     = HiddenPKCircuit<LogicType>;

  QuadCircuit<Field> Q(p256k1_base);
  const CompilerBackend cbk(&Q);
  const LogicType lc(&cbk, p256k1_base);
  CircuitType circuit(lc);

  std::vector<typename CircuitType::v8> eth_addr(20);
  for (size_t i = 0; i < 20; ++i)
    eth_addr[i] = lc.template vinput<8>();
  auto e = lc.eltw_input();

  Q.private_input();
  typename CircuitType::Witness w;
  w.input(lc);
  circuit.assert_hidden_pk(eth_addr, e, w);
  return Q.mkcircuit(/*nc=*/1);
}

void fill_dense(Dense<Field>& W, const HiddenPKWitness& hw,
                const Nat& e_nat, bool prover) {
  const Field& F = p256k1_base;
  DenseFiller<Field> filler(W);

  filler.push_back(F.one());

  auto addr = hw.eth_address_bytes();
  for (size_t i = 0; i < 20; ++i)
    filler.push_back(addr[i], 8, F);

  filler.push_back(F.to_montgomery(e_nat));

  if (prover)
    hw.fill_witness(filler);
}

std::string hex_encode(const std::vector<uint8_t>& buf) {
  static const char hx[] = "0123456789abcdef";
  std::string out;
  out.reserve(buf.size() * 2 + 2);
  out += "0x";
  for (uint8_t b : buf) {
    out += hx[b >> 4];
    out += hx[b & 0xf];
  }
  return out;
}

const char* get_arg(int argc, char** argv, const char* flag) {
  for (int i = 1; i + 1 < argc; ++i) {
    if (strcmp(argv[i], flag) == 0) return argv[i + 1];
  }
  return nullptr;
}

size_t get_size_arg(int argc, char** argv, const char* flag, size_t def) {
  const char* v = get_arg(argc, argv, flag);
  return v ? (size_t)atoi(v) : def;
}

// Parse a runtime 0x-prefixed hex string into a Fp256k1Nat.
// Nat's string constructor only accepts compile-time literals, so we parse
// into a little-endian std::array<uint64_t,4> and use Nat(array).
Fp256k1Nat nat_from_hex(const char* hex) {
  if (hex[0] == '0' && (hex[1] == 'x' || hex[1] == 'X')) hex += 2;
  auto nibble = [](char c) -> uint64_t {
    if (c >= '0' && c <= '9') return (uint64_t)(c - '0');
    if (c >= 'a' && c <= 'f') return (uint64_t)(c - 'a' + 10);
    if (c >= 'A' && c <= 'F') return (uint64_t)(c - 'A' + 10);
    return 0;
  };
  // Pad to 64 hex chars on the left.
  size_t len = strlen(hex);
  char padded[65] = {};
  memset(padded, '0', 64);
  if (len <= 64) memcpy(padded + (64 - len), hex, len);
  padded[64] = '\0';
  // Little-endian: limb[0] = least significant (rightmost 16 nibbles).
  auto parse_u64 = [&](size_t off) -> uint64_t {
    uint64_t v = 0;
    for (size_t i = 0; i < 16; ++i) v = (v << 4) | nibble(padded[off + i]);
    return v;
  };
  std::array<uint64_t, 4> limbs = {
    parse_u64(48),  // least significant
    parse_u64(32),
    parse_u64(16),
    parse_u64(0),   // most significant
  };
  return Fp256k1Nat(limbs);
}

long ms_since(std::chrono::steady_clock::time_point t0) {
  return (long)std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - t0).count();
}

}  // namespace
}  // namespace proofs

int main(int argc, char** argv) {
  using namespace proofs;

  set_log_level(ERROR);

  const char* pkX_str = get_arg(argc, argv, "--pkX");
  const char* pkY_str = get_arg(argc, argv, "--pkY");
  const char* r_str   = get_arg(argc, argv, "--r");
  const char* s_str   = get_arg(argc, argv, "--s");
  const char* msg_str = get_arg(argc, argv, "--msg");

  if (!pkX_str || !pkY_str || !r_str || !s_str || !msg_str) {
    fprintf(stderr,
            "Usage: hidden_pk_prove "
            "--pkX 0x.. --pkY 0x.. --r 0x.. --s 0x.. --msg 0x.. "
            "[--rate N] [--nreq N] [--version N]\n");
    return 1;
  }

  const size_t rate    = get_size_arg(argc, argv, "--rate",    7);
  const size_t nreq    = get_size_arg(argc, argv, "--nreq",    132);
  const size_t version = get_size_arg(argc, argv, "--version", 7);

  const Field& F = p256k1_base;

  // Parse runtime hex strings into big integers.
  Fp256k1Nat pkx_nat = nat_from_hex(pkX_str);
  Fp256k1Nat pky_nat = nat_from_hex(pkY_str);
  Fp256k1Nat e_n     = nat_from_hex(msg_str);
  Fp256k1Nat r_n     = nat_from_hex(r_str);
  Fp256k1Nat s_n     = nat_from_hex(s_str);

  // pk coordinates live in the base field (Montgomery-encoded).
  Elt pkx_mont = F.to_montgomery(pkx_nat);
  Elt pky_mont = F.to_montgomery(pky_nat);

  // Compute the full ZK witness (ECDSA + Keccak-256).
  HiddenPKWitness hw;
  if (!hw.compute(pkx_mont, pky_mont, e_n, r_n, s_n)) {
    fprintf(stderr, "{\"error\":\"ECDSA witness computation failed — "
            "check that (r,s) is a valid signature under (pkX,pkY)\"}\n");
    return 1;
  }

  auto addr = hw.eth_address_bytes();  // 20 bytes

  // Build the compiled circuit.
  auto CIRCUIT = make_circuit();

  auto W   = std::make_unique<Dense<Field>>(1, CIRCUIT->ninputs);
  auto pub = std::make_unique<Dense<Field>>(1, CIRCUIT->npub_in);
  fill_dense(*W,   hw, e_n, true);
  fill_dense(*pub, hw, e_n, false);

  // CRT Reed-Solomon factory for secp256k1.
  using Crt256         = CRT256<Field>;
  using CrtConvFactory = CrtConvolutionFactory<Crt256, Field>;
  using RSFactory      = ReedSolomonFactory<Field, CrtConvFactory>;

  const CrtConvFactory conv(p256k1_base);
  const RSFactory      rsf(conv, p256k1_base);

  // Prove.
  ZkProof<Field> zkpr(*CIRCUIT, rate, nreq);
  Transcript     tp(kLabel, kLabelLen, version);
  SecureRandomEngine rng;

  ZkProver<Field, RSFactory> prover(*CIRCUIT, p256k1_base, rsf);

  auto t0 = std::chrono::steady_clock::now();
  prover.commit(zkpr, *W, tp, rng);
  bool prove_ok = prover.prove(zkpr, *W, tp);
  long prove_ms = ms_since(t0);

  if (!prove_ok) {
    fprintf(stderr, "{\"error\":\"ZK proof generation failed\"}\n");
    return 1;
  }

  // Serialize proof bytes.
  std::vector<uint8_t> zbuf;
  zkpr.write(zbuf, p256k1_base);

  // Re-parse and verify (simulates an independent client).
  ZkProof<Field> zkpv(*CIRCUIT, rate, nreq);
  ReadBuffer rb(zbuf);
  if (!zkpv.read(rb, p256k1_base)) {
    fprintf(stderr, "{\"error\":\"Proof serialization round-trip failed\"}\n");
    return 1;
  }

  ZkVerifier<Field, RSFactory> verifier(*CIRCUIT, rsf, rate, nreq, p256k1_base);
  Transcript tv(kLabel, kLabelLen, version);
  verifier.recv_commitment(zkpv, tv);

  auto v0 = std::chrono::steady_clock::now();
  bool verify_ok = verifier.verify(zkpv, *pub, tv);
  long verify_ms = ms_since(v0);

  if (!verify_ok) {
    fprintf(stderr, "{\"error\":\"ZK verification failed\"}\n");
    return 1;
  }

  // Encode the Ethereum address.
  static const char hx[] = "0123456789abcdef";
  char eth_addr_hex[43] = "0x";
  for (size_t i = 0; i < 20; ++i) {
    eth_addr_hex[2 + i * 2]     = hx[addr[i] >> 4];
    eth_addr_hex[2 + i * 2 + 1] = hx[addr[i] & 0xf];
  }
  eth_addr_hex[42] = '\0';

  std::string proof_hex = hex_encode(zbuf);

  printf("{\"proofHex\":\"%s\",\"proofSizeBytes\":%zu,"
         "\"proveMs\":%ld,\"verifyMs\":%ld,\"ethAddr\":\"%s\"}\n",
         proof_hex.c_str(), zbuf.size(), prove_ms, verify_ms, eth_addr_hex);

  return 0;
}
