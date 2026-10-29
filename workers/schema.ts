// This is the schema source of truth. Apply explicitly with scripts/schema.mjs;
// requests never change schema or seed production money/accounts.
// Existing databases may retain legacy currency columns/enum values for history.
// New orders/settlements are restricted to VND + BANK/WALLET by the guards below.
import { MMO_SCHEMA_STATEMENTS } from './mmo/schema.ts';
export function authColumnUpgrades(columns: string[]) {
  return columns.length ? ['username', 'displayUsername'].filter((name) => !columns.includes(name)).map((name) => `ALTER TABLE user ADD COLUMN ${name} TEXT`) : [];
}

export const SCHEMA_STATEMENTS = [
  ...MMO_SCHEMA_STATEMENTS,
  `CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, username TEXT, displayUsername TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_username ON user(username COLLATE NOCASE) WHERE username IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS session_user ON session(userId)`,
  `CREATE TABLE IF NOT EXISTS admin_accounts (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN('owner','finance','support','editor','auditor')))`,
  `CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS account_user ON account(userId)`,
  `CREATE TABLE IF NOT EXISTS verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS verification_identifier ON verification(identifier)`,
  `CREATE TABLE IF NOT EXISTS rateLimit (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, lastRequest INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY REFERENCES user(id), disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)), phone TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT (unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS wallets (user_id TEXT PRIMARY KEY REFERENCES user(id), balance INTEGER NOT NULL DEFAULT 0 CHECK(typeof(balance)='integer' AND balance>=0), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Khác', image_url TEXT, selling_price INTEGER NOT NULL CHECK(selling_price>0), in_stock INTEGER NOT NULL DEFAULT 1 CHECK(in_stock IN(0,1)), updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), channel TEXT NOT NULL CHECK(channel IN('web','telegram')), currency TEXT NOT NULL CHECK(currency='VND'), total INTEGER NOT NULL CHECK(typeof(total)='integer' AND total>0), items TEXT NOT NULL CHECK(json_valid(items)), customer TEXT NOT NULL CHECK(json_valid(customer)), payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(payment_status IN('UNPAID','PAID','REFUNDED')), fulfillment_status TEXT NOT NULL DEFAULT 'NOT_READY' CHECK(fulfillment_status IN('NOT_READY','QUEUED','DELIVERED')), delivery TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`,
  `CREATE INDEX IF NOT EXISTS orders_owner ON orders(user_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY CHECK(id='payment'), version INTEGER NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))`,
  `INSERT OR IGNORE INTO settings(id,version,body) VALUES('payment',1,'{"enabled":false,"provider":"sepay","bankBin":"970416","bankName":"ACB","accountNumber":"","accountHolder":"","minTopup":10000,"maxTopup":5000000,"intentTtl":900}')`,
  `CREATE TABLE IF NOT EXISTS intents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), purpose TEXT NOT NULL CHECK(purpose IN('ORDER','TOPUP')), order_id TEXT REFERENCES orders(id), amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0), account_number TEXT NOT NULL, config TEXT NOT NULL CHECK(json_valid(config)), status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','SUCCEEDED','EXPIRED')), created_at INTEGER NOT NULL DEFAULT(unixepoch()), expires_at INTEGER NOT NULL, CHECK((purpose='ORDER' AND order_id IS NOT NULL) OR (purpose='TOPUP' AND order_id IS NULL)))`,
  `CREATE INDEX IF NOT EXISTS intents_owner ON intents(user_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN('sepay','telegram')), payload TEXT NOT NULL CHECK(json_valid(payload)), status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','DONE','REVIEW')), error TEXT, created_at INTEGER NOT NULL DEFAULT(unixepoch()))`,
  `CREATE INDEX IF NOT EXISTS inbox_pending ON inbox(status,created_at)`,
  `CREATE TABLE IF NOT EXISTS bank_transactions (id TEXT PRIMARY KEY, provider TEXT NOT NULL, provider_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), account_number TEXT NOT NULL, content TEXT NOT NULL, happened_at INTEGER NOT NULL, intent_id TEXT REFERENCES intents(id), status TEXT NOT NULL DEFAULT 'REVIEW' CHECK(status IN('REVIEW','ALLOCATED')), UNIQUE(provider,provider_id))`,
  `CREATE TABLE IF NOT EXISTS allocations (transaction_id TEXT PRIMARY KEY REFERENCES bank_transactions(id), intent_id TEXT NOT NULL UNIQUE REFERENCES intents(id), created_at INTEGER NOT NULL DEFAULT(unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id), source TEXT NOT NULL CHECK(source IN('WALLET','BANK')), external_id TEXT UNIQUE, created_at INTEGER NOT NULL DEFAULT(unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS journals (id TEXT PRIMARY KEY, source TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES user(id), kind TEXT NOT NULL CHECK(kind IN('TOPUP','PURCHASE','ADJUSTMENT','REFUND')), amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0), wallet_delta INTEGER NOT NULL CHECK(abs(wallet_delta)=amount), debit_account TEXT NOT NULL, credit_account TEXT NOT NULL, memo TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()), CHECK(debit_account<>credit_account))`,
  `CREATE INDEX IF NOT EXISTS journals_owner ON journals(user_id,created_at DESC)`,
  `CREATE VIEW IF NOT EXISTS ledger_entries AS SELECT id AS journal_id,debit_account AS account,-amount AS amount,'VND' AS currency FROM journals UNION ALL SELECT id,credit_account,amount,'VND' FROM journals`,
  `CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), kind TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','SENDING','DONE')), attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT(unixepoch()), error TEXT, created_at INTEGER NOT NULL DEFAULT(unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), hash TEXT NOT NULL, result_id TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS admin_roles (email TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN('owner','finance','support','editor','auditor')))`,
  `CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('PAYMENT_CONFIG','WALLET_ADJUSTMENT','WALLET_REFUND')), body TEXT NOT NULL CHECK(json_valid(body)), requested_by TEXT NOT NULL, approved_by TEXT, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','APPROVED')), created_at INTEGER NOT NULL DEFAULT(unixepoch()), CHECK(status='PENDING' OR (approved_by IS NOT NULL AND approved_by<>requested_by)))`,
  `CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS page_versions (id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, blocks TEXT NOT NULL CHECK(json_valid(blocks)), created_by TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS pages (slug TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES page_versions(id), published_id TEXT REFERENCES page_versions(id))`,
  `CREATE TABLE IF NOT EXISTS telegram_links (user_id TEXT PRIMARY KEY REFERENCES user(id), telegram_id TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS link_challenges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), telegram_id TEXT, chat_id TEXT, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS telegram_logins (id TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, user_id TEXT REFERENCES user(id), telegram_id TEXT, confirmed_at INTEGER, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reconciliation_runs (id TEXT PRIMARY KEY, status TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS reconciliation_state (id TEXT PRIMARY KEY, completed_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS inbox_retries (id TEXT PRIMARY KEY REFERENCES inbox(id), attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS admin_commands (id TEXT PRIMARY KEY, hash TEXT NOT NULL, result_id TEXT NOT NULL REFERENCES approvals(id))`,
  `CREATE TRIGGER IF NOT EXISTS journal_guard BEFORE INSERT ON journals BEGIN
    SELECT CASE WHEN COALESCE((SELECT balance FROM wallets WHERE user_id=NEW.user_id),0)<>COALESCE((SELECT SUM(wallet_delta) FROM journals WHERE user_id=NEW.user_id),0) THEN RAISE(ABORT,'LEDGER_MISMATCH') END;
    SELECT CASE WHEN NEW.wallet_delta<0 AND COALESCE((SELECT balance FROM wallets WHERE user_id=NEW.user_id),0)<NEW.amount THEN RAISE(ABORT,'INSUFFICIENT_BALANCE') END;
    SELECT CASE WHEN EXISTS(SELECT 1 FROM customers WHERE id=NEW.user_id AND disabled=1) THEN RAISE(ABORT,'ACCOUNT_DISABLED') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS journal_apply AFTER INSERT ON journals BEGIN
    INSERT INTO wallets(user_id,balance) VALUES(NEW.user_id,0) ON CONFLICT(user_id) DO NOTHING;
    UPDATE wallets SET balance=balance+NEW.wallet_delta,updated_at=unixepoch() WHERE user_id=NEW.user_id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS journal_no_update BEFORE UPDATE ON journals BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END`,
  `CREATE TRIGGER IF NOT EXISTS journal_no_delete BEFORE DELETE ON journals BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END`,
  `CREATE TRIGGER IF NOT EXISTS settlement_guard BEFORE INSERT ON settlements BEGIN
    SELECT CASE WHEN NEW.source NOT IN('WALLET','BANK') THEN RAISE(ABORT,'INVALID_PAYMENT_METHOD') END;
    SELECT CASE WHEN EXISTS(SELECT 1 FROM orders o JOIN wallets w ON w.user_id=o.user_id WHERE o.id=NEW.order_id AND w.balance<>COALESCE((SELECT SUM(wallet_delta) FROM journals WHERE user_id=o.user_id),0)) THEN RAISE(ABORT,'LEDGER_MISMATCH') END;
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND payment_status='UNPAID') THEN RAISE(ABORT,'ORDER_ALREADY_PAID') END;
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND currency='VND') THEN RAISE(ABORT,'INVALID_PAYMENT_METHOD') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS order_currency_guard BEFORE INSERT ON orders WHEN NEW.currency<>'VND' BEGIN SELECT RAISE(ABORT,'INVALID_CURRENCY'); END`,
  `CREATE TRIGGER IF NOT EXISTS settlement_apply AFTER INSERT ON settlements BEGIN
    INSERT INTO journals(id,source,user_id,kind,amount,wallet_delta,debit_account,credit_account,memo)
      SELECT NEW.id,'settlement:'||NEW.id,user_id,'PURCHASE',total,-total,'wallet:'||user_id,'sales',id FROM orders WHERE id=NEW.order_id AND NEW.source='WALLET';
    UPDATE orders SET payment_status='PAID',fulfillment_status='QUEUED' WHERE id=NEW.order_id;
    INSERT INTO outbox(id,user_id,kind,body) SELECT 'paid:'||id,user_id,'ORDER_PAID',json_object('orderId',id) FROM orders WHERE id=NEW.order_id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS allocation_guard BEFORE INSERT ON allocations BEGIN
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM intents i JOIN bank_transactions b ON b.id=NEW.transaction_id WHERE i.id=NEW.intent_id AND i.status='PENDING' AND i.amount=b.amount AND i.account_number=b.account_number AND b.happened_at BETWEEN i.created_at AND i.expires_at AND b.intent_id=i.id) THEN RAISE(ABORT,'PAYMENT_REVIEW_REQUIRED') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS allocation_apply AFTER INSERT ON allocations BEGIN
    INSERT INTO settlements(id,order_id,source,external_id) SELECT NEW.transaction_id,order_id,'BANK',NEW.transaction_id FROM intents WHERE id=NEW.intent_id AND purpose='ORDER';
    INSERT INTO journals(id,source,user_id,kind,amount,wallet_delta,debit_account,credit_account,memo) SELECT NEW.transaction_id,'bank:'||NEW.transaction_id,user_id,'TOPUP',amount,amount,'bank:'||json_extract(config,'$.bankName'),'wallet:'||user_id,id FROM intents WHERE id=NEW.intent_id AND purpose='TOPUP';
    UPDATE intents SET status='SUCCEEDED' WHERE id=NEW.intent_id;
    UPDATE bank_transactions SET status='ALLOCATED' WHERE id=NEW.transaction_id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END`,
  `CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END`,
  `CREATE TRIGGER IF NOT EXISTS approval_guard BEFORE UPDATE ON approvals BEGIN
    SELECT CASE WHEN OLD.status<>'PENDING' OR NEW.status<>'APPROVED' OR NEW.kind<>OLD.kind OR NEW.body<>OLD.body OR NEW.requested_by<>OLD.requested_by THEN RAISE(ABORT,'APPROVAL_ALREADY_APPLIED') END;
    SELECT CASE WHEN NEW.kind='PAYMENT_CONFIG' AND json_extract(NEW.body,'$.expectedVersion')<>(SELECT version FROM settings WHERE id='payment') THEN RAISE(ABORT,'STALE_CONFIG') END;
    SELECT CASE WHEN NEW.kind='WALLET_REFUND' AND NOT EXISTS(SELECT 1 FROM orders o JOIN settlements s ON s.order_id=o.id WHERE o.id=json_extract(NEW.body,'$.orderId') AND o.payment_status='PAID' AND s.source='WALLET') THEN RAISE(ABORT,'INVALID_REFUND') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS approval_apply AFTER UPDATE ON approvals BEGIN
    UPDATE settings SET body=json_extract(NEW.body,'$.config'),version=version+1,updated_at=unixepoch() WHERE id='payment' AND NEW.kind='PAYMENT_CONFIG';
    INSERT INTO journals(id,source,user_id,kind,amount,wallet_delta,debit_account,credit_account,memo)
      SELECT NEW.id,'adjustment:'||NEW.id,json_extract(NEW.body,'$.userId'),'ADJUSTMENT',abs(json_extract(NEW.body,'$.delta')),json_extract(NEW.body,'$.delta'),
        CASE WHEN json_extract(NEW.body,'$.delta')>0 THEN 'adjustments' ELSE 'wallet:'||json_extract(NEW.body,'$.userId') END,
        CASE WHEN json_extract(NEW.body,'$.delta')>0 THEN 'wallet:'||json_extract(NEW.body,'$.userId') ELSE 'adjustments' END,json_extract(NEW.body,'$.reason') WHERE NEW.kind='WALLET_ADJUSTMENT';
    INSERT INTO journals(id,source,user_id,kind,amount,wallet_delta,debit_account,credit_account,memo)
      SELECT NEW.id,'refund:'||o.id,o.user_id,'REFUND',o.total,o.total,'sales','wallet:'||o.user_id,json_extract(NEW.body,'$.reason') FROM orders o WHERE NEW.kind='WALLET_REFUND' AND o.id=json_extract(NEW.body,'$.orderId');
    UPDATE orders SET payment_status='REFUNDED' WHERE NEW.kind='WALLET_REFUND' AND id=json_extract(NEW.body,'$.orderId');
    INSERT INTO audit(id,actor,action,target,detail) VALUES('approval:'||NEW.id,NEW.approved_by,'APPROVE_'||NEW.kind,NEW.id,json_object('requestedBy',NEW.requested_by));
  END`,
  `CREATE TRIGGER IF NOT EXISTS delivery_notify AFTER UPDATE OF fulfillment_status ON orders WHEN NEW.fulfillment_status='DELIVERED' AND OLD.fulfillment_status<>'DELIVERED' BEGIN
    INSERT INTO outbox(id,user_id,kind,body) VALUES('delivery:'||NEW.id,NEW.user_id,'ORDER_DELIVERED',json_object('orderId',NEW.id));
  END`,
];
