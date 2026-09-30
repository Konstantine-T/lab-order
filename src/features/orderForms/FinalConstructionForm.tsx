import type { ComponentProps } from 'react';
import { CrownAndBridgeForm } from './CrownAndBridgeForm';
import type { FinalConstructionAnswers } from './fcTypes';

type Props = Omit<ComponentProps<typeof CrownAndBridgeForm>, 'value' | 'onChange' | 'design'> & {
  value: FinalConstructionAnswers;
  onChange: (next: FinalConstructionAnswers) => void;
};

/**
 * Final Construction: the Crown & Bridge form, reused whole the way Temporary
 * Crown and Titanium Milling reuse it, with its design section switched on.
 */
export function FinalConstructionForm({ value, onChange, ...rest }: Props) {
  return (
    <CrownAndBridgeForm
      {...rest}
      value={value}
      onChange={(cnb) => onChange({ ...value, ...cnb })}
      design={{
        value: { fcToothShape: value.fcToothShape, fcDesignNotes: value.fcDesignNotes },
        onChange: (d) => onChange({ ...value, ...d }),
      }}
    />
  );
}
