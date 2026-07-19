CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"bucket_minute" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_bucket_minute_pk" PRIMARY KEY("key","bucket_minute")
);
