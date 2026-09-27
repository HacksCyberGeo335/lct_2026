import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resetDemoPlan } from '../../api/demoStorage';
import type { Project } from '../../domain/models';
import { Modal } from '../../shared/ui';

export function PlanRecovery({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      resetDemoPlan(project.id);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['demo', 'objects'] }),
        client.invalidateQueries({ queryKey: ['demo', 'report', project.id] }),
      ]);
    },
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <div className="query-state" role="alert">
        <h2 className="h-sec">План объекта недоступен</h2>
        <p>{project.planError}</p>
        <button className="btn btn-quiet" onClick={() => setOpen(true)}>
          Восстановить исходный план
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Восстановить план объекта?"
        description={
          'Будет удалён только сохранённый план объекта «' +
          project.name +
          '». Настройки и другие объекты сохранятся.'
        }
      >
        {mutation.error && (
          <p role="alert" className="error-text">
            {mutation.error.message}
          </p>
        )}
        <div className="actions">
          <button className="btn btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Восстановить план
          </button>
          <button className="btn btn-quiet" onClick={() => setOpen(false)}>
            Отмена
          </button>
        </div>
      </Modal>
    </>
  );
}
