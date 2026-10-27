from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import chaoxing

app = FastAPI(title="Homework Reminder API", version="0.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class BindRequest(BaseModel):
    phone: str
    password: str


class FetchRequest(BaseModel):
    workListUrl: str


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "homework-reminder"}


@app.post("/api/chaoxing/bind")
def bind_chaoxing(request: BindRequest) -> dict:
    return chaoxing.bind_account(request.phone, request.password)


@app.get("/api/chaoxing/status")
def chaoxing_status() -> dict[str, bool]:
    return {"bound": chaoxing.has_valid_credentials()}


@app.post("/api/chaoxing/unbind")
def unbind_chaoxing() -> dict[str, bool]:
    return chaoxing.unbind_account()


@app.post("/api/homework/fetch")
def fetch_homework(request: FetchRequest) -> dict:
    return chaoxing.fetch_homework(request.workListUrl)


@app.post("/api/homework/fetch-all")
def fetch_all_homework() -> dict:
    return chaoxing.fetch_all_homework()


@app.get("/api/homework/last")
def last_homework() -> dict:
    return chaoxing.get_last_homework()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
