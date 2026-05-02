from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pathlib import Path
import shutil
import os
from ..database import get_db
from .. import models, schemas

router = APIRouter(
    prefix="/categories",
    tags=["categories"]
)

@router.get("/", response_model=List[schemas.CategoryOut])
def get_categories(db: Session = Depends(get_db)):
    """
    Tüm kategorileri listele.
    """
    return db.query(models.Category).all()

@router.post("/", response_model=schemas.CategoryOut)
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db)):
    """
    Yeni bir kategori oluştur.
    """
    # Aynı ID'ye sahip kategori varsa hata ver
    existing = db.query(models.Category).filter(models.Category.id == category.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category with this ID already exists")

    db_category = models.Category(**category.model_dump())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

@router.get("/{category_id}/image")
def get_category_image(category_id: str, db: Session = Depends(get_db)):
    """
    Kategori resmini serve et.
    """
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not category or not category.image_filename:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = Path(__file__).parents[2] / "static" / "categories" / category.image_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    return FileResponse(path=file_path, media_type="image/png")

@router.get("/{category_id}", response_model=schemas.CategoryOut)
def get_category(category_id: str, db: Session = Depends(get_db)):
    """
    ID'ye göre kategori getir.
    """
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category

@router.put("/{category_id}", response_model=schemas.CategoryOut)
def update_category(category_id: str, category_update: schemas.CategoryUpdate, db: Session = Depends(get_db)):
    """
    Kategoriyi güncelle.
    """
    db_category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    update_data = category_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_category, key, value)

    db.commit()
    db.refresh(db_category)
    return db_category

@router.put("/{category_id}/image")
def upload_category_image(category_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Kategori resmi yükle (PNG, JPG vb.).
    """
    db_category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    # Dosya adı oluştur: category_id + extension
    import uuid
    ext = Path(file.filename or "image").suffix or ".png"
    filename = f"{category_id}_{uuid.uuid4().hex}{ext}"

    # Eski dosya varsa sil
    if db_category.image_filename:
        old_path = Path(__file__).parents[2] / "static" / "categories" / db_category.image_filename
        try:
            if old_path.exists():
                old_path.unlink()
        except Exception:
            pass

    # Yeni dosyayı kaydet
    file_path = Path(__file__).parents[2] / "static" / "categories" / filename
    file_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")

    # DB'yi güncelle
    db_category.image_filename = filename
    db.commit()
    db.refresh(db_category)

    return db_category

@router.delete("/{category_id}")
def delete_category(category_id: str, db: Session = Depends(get_db)):
    """
    Kategoriyi sil. Eğer dosyası varsa, onu da sil.
    """
    db_category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Dosya varsa sil
    if db_category.image_filename:
        file_path = Path(__file__).parents[2] / "static" / "categories" / db_category.image_filename
        try:
            if file_path.exists():
                file_path.unlink()
        except Exception:
            pass  # Dosya silinmezse de işleme devam et

    db.delete(db_category)
    db.commit()
    return {"message": "Category deleted"}
