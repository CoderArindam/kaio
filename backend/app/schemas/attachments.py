from pydantic import BaseModel

class AttachmentCreate(BaseModel):
    file_name: str
    file_url: str

class AttachmentAnnotationsUpdate(BaseModel):
    annotations: list = []
