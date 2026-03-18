from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter()

class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    username:     Optional[str] = None
    bio:          Optional[str] = None
    avatar_url:   Optional[str] = None
    last_seen_visible: Optional[bool] = None

@router.get("/search")
def search_users(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    users = db.query(User).filter(
        User.username.ilike(f"%{q}%"),
        User.id != current_user.id
    ).limit(20).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "is_online": u.is_online,
            "last_seen_visible": getattr(u, "last_seen_visible", True),
            "last_seen": str(u.last_seen) if u.last_seen else None,
        }
        for u in users
    ]

@router.get("/me")
def get_profile(current_user: User = Depends(get_current_user)):
    return {
        "id":           current_user.id,
        "username":     current_user.username,
        "email":        current_user.email,
        "display_name": current_user.display_name,
        "avatar_url":   current_user.avatar_url,
        "bio":          current_user.bio,
        "last_seen_visible": getattr(current_user, "last_seen_visible", True),
        "last_seen":    str(current_user.last_seen) if current_user.last_seen else None,
    }

@router.put("/me")
def update_profile(
    data: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Username unique check
    if data.username and data.username != current_user.username:
        existing = db.query(User).filter(
            User.username == data.username,
            User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken!")

    if data.display_name is not None:
        current_user.display_name = data.display_name.strip() or current_user.display_name
    if data.username is not None:
        current_user.username = data.username.strip() or current_user.username
    if data.bio is not None:
        current_user.bio = data.bio.strip()
    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url
    if data.last_seen_visible is not None:
        # last_seen_visible column nattam gracefully handle karanna
        try:
            current_user.last_seen_visible = data.last_seen_visible
        except Exception:
            pass

    try:
        db.commit()
        db.refresh(current_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "id":           current_user.id,
        "username":     current_user.username,
        "display_name": current_user.display_name,
        "avatar_url":   current_user.avatar_url,
        "bio":          current_user.bio,
        "last_seen_visible": getattr(current_user, "last_seen_visible", True),
    }
