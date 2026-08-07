import asyncio
import httpx
import os
import jwt
from datetime import datetime, timedelta, timezone

async def main():
    secret = 'vA._HW/wuJLOsyos9v=G/1tPaPhyUnIR.L7%DX[T{53W?Cy)|ERa<Gt?NLPL04l+e4:UCW&5i{Vy*fH_;?<pk_'
    payload = {
        "sub": "5",
        "email": "coderarindam@gmail.com",
        "exp": datetime.now(timezone.utc) + timedelta(days=1),
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, secret, algorithm="HS256")

    async with httpx.AsyncClient() as client:
        # End to End test: GET comments
        response = await client.get("http://127.0.0.1:8000/api/v1/tasks/12/comments", headers={"Authorization": f"Bearer {token}"})
        print("GET /comments STATUS:", response.status_code)
        data = response.json()
        for comment in data.get("data", []):
            if comment["id"] in (7, 8):
                print(f"Comment {comment['id']} reactions:", ascii(str(comment.get("reactions"))))

if __name__ == '__main__':
    asyncio.run(main())
