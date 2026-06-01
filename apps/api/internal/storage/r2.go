package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"attendly/api/internal/config"
)

// r2Store talks to Cloudflare R2 over its S3-compatible API via minio-go.
type r2Store struct {
	client *minio.Client
	bucket string
}

func newR2(c config.R2Config) (Store, error) {
	endpoint := fmt.Sprintf("%s.r2.cloudflarestorage.com", c.AccountID)
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""),
		Secure: true,
		Region: "auto",
	})
	if err != nil {
		return nil, fmt.Errorf("r2 client: %w", err)
	}
	return &r2Store{client: client, bucket: c.Bucket}, nil
}

func (s *r2Store) Put(ctx context.Context, key string, body []byte, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, bytes.NewReader(body), int64(len(body)),
		minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (s *r2Store) Get(ctx context.Context, key string) (*Object, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()

	info, err := obj.Stat()
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return nil, ErrNotFound
		}
		return nil, err
	}
	data, err := io.ReadAll(obj)
	if err != nil {
		return nil, err
	}
	return &Object{Body: data, ContentType: info.ContentType}, nil
}

func (s *r2Store) Delete(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}
