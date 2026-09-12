package mcp

import (
	"context"
	"fmt"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Entity loaders that carry their own scope check.
//
// Every "get X by id" tool has to do the same two things: fetch the record,
// and check the agent may act on the operation it belongs to. The resolver
// authorizes the owner against that operation, but it knows nothing about the
// key's scope list or role ceiling, so the check is repeated here on the
// operation id the record carries. Keeping fetch and check in one function
// per entity means a tool cannot get the record without the check having run.
//
// A miss is reported as "not found" without detail, and so is a record the
// key may not reach: telling an agent which ids exist outside its scope is a
// leak in its own right.

func (s *Server) loadHost(ctx context.Context, id string, minRole models.OperationRole) (*models.Host, error) {
	host, err := s.deps.Hosts.Host(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("host not found")
	}
	if _, err := s.authorizeOperation(ctx, host.OperationID, minRole); err != nil {
		return nil, err
	}
	return host, nil
}

func (s *Server) loadCredential(ctx context.Context, id string, minRole models.OperationRole) (*models.Credential, error) {
	cred, err := s.deps.Credentials.Credential(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("credential not found")
	}
	if _, err := s.authorizeOperation(ctx, cred.OperationID, minRole); err != nil {
		return nil, err
	}
	return cred, nil
}

func (s *Server) loadHash(ctx context.Context, id string, minRole models.OperationRole) (*models.Hash, error) {
	hash, err := s.deps.Hashes.Hash(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("hash not found")
	}
	if _, err := s.authorizeOperation(ctx, hash.OperationID, minRole); err != nil {
		return nil, err
	}
	return hash, nil
}

func (s *Server) loadWikiDocument(ctx context.Context, id string, minRole models.OperationRole) (*models.WikiDocument, error) {
	doc, err := s.deps.WikiDocs.WikiDocument(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("wiki page not found")
	}
	if _, err := s.authorizeOperation(ctx, doc.OperationID, minRole); err != nil {
		return nil, err
	}
	return doc, nil
}

// loadTaskInScope fetches a task and applies both gates: the operation role,
// and whether this agent may touch that particular task at all.
func (s *Server) loadTaskInScope(ctx context.Context, taskID string, minRole models.OperationRole) (*models.Task, error) {
	task, err := s.deps.Tasks.Task(ctx, taskID)
	if err != nil {
		return nil, fmt.Errorf("task not found")
	}
	if _, err := s.authorizeOperation(ctx, task.OperationID, minRole); err != nil {
		return nil, err
	}
	owner, err := agentOwnerID(ctx)
	if err != nil {
		return nil, err
	}
	if err := requireTaskInScope(task, owner); err != nil {
		return nil, err
	}
	return task, nil
}
