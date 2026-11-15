from sentinel_ctf.tools.crypto.xor_tool import XorTool
from sentinel_ctf.tools.crypto.rsa_tool import RsaTool
from sentinel_ctf.payloads.web.payloads import PayloadEngine
from sentinel_ctf.tools.crypto.hash_cracker import HashCrackerTool
from sentinel_ctf.payloads.misc.payloads import auto_decode, detect_esoteric

# XOR
data = bytes([ord(c) ^ 0x42 for c in 'flag{xor_test}'])
results = XorTool.single_byte_brute(data)
print('XOR best key:', hex(results[0]['key']), '| decrypted:', results[0]['decrypted'])

# RSA
p, q, e = 61, 53, 17
n = p * q
m = 65
c = pow(m, e, n)
decrypted = RsaTool.decrypt_rsa(p, q, e, c)
print('RSA decrypted bytes:', decrypted)
result = RsaTool.fermat_factor(3233)
print('Fermat factors of 3233:', result)

# Web payloads
sqli = PayloadEngine.get('sqli')
print(f'SQLi payloads: {len(sqli)}')
xss = PayloadEngine.get('xss')
print(f'XSS payloads: {len(xss)}')
mutations = PayloadEngine.mutate("' OR 1=1--")
print(f'Mutations of payload: {len(mutations)}')

# Hash
guesses = HashCrackerTool.identify_hash('5f4dcc3b5aa765d61d8327deb882cf99')
print('Hash identified as:', guesses)
cracked = HashCrackerTool.try_common('5f4dcc3b5aa765d61d8327deb882cf99')
print('Quick crack result:', cracked)

# Misc decoder
results2 = auto_decode('ZmxhZ3t0ZXN0fQ==')
print('Auto-decode base64:', results2.get('base64', ''))

# Esoteric detection
sample = '+++++++++[>++++++++<-]>.'
langs = detect_esoteric(sample)
print('Esoteric lang detected:', langs)
