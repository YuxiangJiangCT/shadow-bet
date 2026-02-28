.PHONY: test build deploy dev clean install

# ── Dependencies ─────────────────────────────────────────
install:
	cd frontend && npm install
	cd contracts && forge install

# ── Contract ─────────────────────────────────────────────
test:
	cd contracts && forge test -vvv

build-contracts:
	cd contracts && forge build

deploy:
	@test -n "$(PRIVATE_KEY)" || (echo "Error: set PRIVATE_KEY in .env" && exit 1)
	cd contracts && forge create src/ShadowBet.sol:ShadowBet \
		--rpc-url https://testnet-rpc.monad.xyz \
		--private-key $(PRIVATE_KEY)

# ── Frontend ─────────────────────────────────────────────
dev:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

# ── Utility ──────────────────────────────────────────────
clean:
	cd contracts && forge clean
	cd frontend && rm -rf dist
