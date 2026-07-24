import asyncio
import logging
import asyncpg
from typing import AsyncGenerator
from app.config.settings import settings

import json

logger = logging.getLogger("kaio.database")


async def init_connection(conn):
    await conn.set_type_codec('jsonb', encoder=json.dumps, decoder=json.loads, schema='pg_catalog')
    await conn.set_type_codec('json', encoder=json.dumps, decoder=json.loads, schema='pg_catalog')


class Database:
    def __init__(self):
        self.pool: asyncpg.Pool = None

    async def connect(self, retries: int = 5, retry_delay: float = 2.0):
        for attempt in range(1, retries + 1):
            try:
                self.pool = await asyncpg.create_pool(
                    settings.DATABASE_URL,
                    min_size=1,
                    max_size=10,
                    init=init_connection
                )
                logger.info(f"Database connection pool initialized successfully (Attempt {attempt}/{retries}).")
                return
            except Exception as e:
                logger.warning(f"Database connection attempt {attempt}/{retries} failed: {e}")
                if attempt == retries:
                    logger.error("Max database connection retries reached.")
                    raise
                await asyncio.sleep(retry_delay)

    async def is_healthy(self) -> bool:
        if not self.pool:
            return False
        try:
            async with self.pool.acquire(timeout=2.0) as connection:
                val = await connection.fetchval("SELECT 1")
                return val == 1
        except Exception as e:
            logger.warning(f"Database health check failed: {e}")
            return False

    async def disconnect(self):
        if self.pool:
            await self.pool.close()
            logger.info("Database pool closed cleanly.")


db = Database()


async def get_db_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    if not db.pool:
        raise Exception("Database pool is not initialized")
    async with db.pool.acquire() as connection:
        yield connection

