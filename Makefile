.PHONY: setup dev test stop

SUPABASE := npx --yes supabase@2.119.0

setup:
	npm install
	$(SUPABASE) start
	$(SUPABASE) db reset
	node scripts/write-env.mjs
	node scripts/seed-images.mjs

dev:
	npm run dev

test:
	npm test

stop:
	$(SUPABASE) stop
